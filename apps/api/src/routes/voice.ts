import { Router } from 'express'
import { z }       from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { requireRole }  from '../middleware/requireRole.js'
import crypto           from 'crypto'

const router = Router()

// ── Call Scripts (scripted V1 flows, no eval) ─────────────────────────────────

const ScriptNodeSchema = z.object({
  id:   z.string(),
  type: z.enum(['greeting', 'question', 'condition', 'handoff', 'end']),
  text: z.string().min(1).max(2000),
  next: z.string().optional(),  // next node id
})

const CallScriptSchema = z.object({
  name:     z.string().min(1).max(100),
  nodes:    z.array(ScriptNodeSchema).min(1).max(50),
  isActive: z.boolean().default(true),
})

router.get('/scripts', authenticate, async (req, res, next) => {
  try {
    const scripts = await req.db.callScript.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { callRecords: true } } },
    })
    res.json(scripts)
  } catch (err) { next(err) }
})

router.post('/scripts', authenticate, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body   = CallScriptSchema.parse(req.body)
    const script = await req.db.callScript.create({ data: { ...body, tenantId: req.tenantId } })
    res.status(201).json(script)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.patch('/scripts/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body   = CallScriptSchema.partial().parse(req.body)
    const script = await req.db.callScript.update({ where: { id: req.params.id }, data: body })
    res.json(script)
  } catch (err) { next(err) }
})

router.delete('/scripts/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
  try {
    await req.db.callScript.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── Call Records ──────────────────────────────────────────────────────────────

router.get('/calls', authenticate, async (req, res, next) => {
  try {
    const page  = Math.max(1, Number(req.query.page ?? 1))
    const limit = 25
    const calls = await req.db.callRecord.findMany({
      orderBy: { startedAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
      include: {
        contact:    { select: { id: true, name: true } },
        callScript: { select: { id: true, name: true } },
      },
    })
    res.json(calls)
  } catch (err) { next(err) }
})

router.get('/calls/:id', authenticate, async (req, res, next) => {
  try {
    const call = await req.db.callRecord.findFirst({
      where:   { id: req.params.id },
      include: {
        contact:    { select: { id: true, name: true, email: true, phone: true } },
        deal:       { select: { id: true, title: true } },
        callScript: { select: { id: true, name: true } },
      },
    })
    if (!call) { res.status(404).json({ error: 'Call not found' }); return }
    res.json(call)
  } catch (err) { next(err) }
})

// ── Initiate outbound call (requires consent) ─────────────────────────────────

const OutboundSchema = z.object({
  toNumber:      z.string().min(7).max(20),
  contactId:     z.string().optional(),
  dealId:        z.string().optional(),
  callScriptId:  z.string().optional(),
  consentGiven:  z.literal(true, { errorMap: () => ({ message: 'Explicit consent required for outbound AI calls' }) }),
})

router.post('/calls/outbound', authenticate, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = OutboundSchema.parse(req.body)

    const vapiKey  = process.env.VAPI_API_KEY
    const fromNum  = process.env.VAPI_PHONE_NUMBER
    const assistId = process.env.VAPI_ASSISTANT_ID

    if (!vapiKey || !fromNum) {
      res.status(503).json({ error: 'VAPI_API_KEY and VAPI_PHONE_NUMBER must be configured in .env' })
      return
    }

    // Create record first — will be updated via webhook
    const record = await req.db.callRecord.create({
      data: {
        tenantId:     req.tenantId,
        direction:    'OUTBOUND',
        status:       'INITIATED',
        fromNumber:   fromNum,
        toNumber:     body.toNumber,
        consentGiven: true,
        contactId:    body.contactId,
        dealId:       body.dealId,
        callScriptId: body.callScriptId,
      },
    })

    // Initiate call via Vapi
    const fetch = (await import('node-fetch')).default
    const vapiRes = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${vapiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumberId: fromNum,
        customer: { number: body.toNumber },
        ...(assistId ? { assistantId: assistId } : {}),
        metadata: { callRecordId: record.id, tenantId: req.tenantId },
      }),
    })

    if (!vapiRes.ok) {
      await req.db.callRecord.update({ where: { id: record.id }, data: { status: 'FAILED' } })
      const err = await vapiRes.json() as { message?: string }
      res.status(502).json({ error: err.message ?? 'Vapi call initiation failed' })
      return
    }

    const vapiData = await vapiRes.json() as { id?: string }
    if (vapiData.id) {
      await req.db.callRecord.update({ where: { id: record.id }, data: { vapiCallId: vapiData.id, status: 'RINGING' } })
    }

    res.status(201).json({ callRecordId: record.id, vapiCallId: vapiData.id })
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.issues[0]?.message ?? 'Validation failed' }); return }
    next(err)
  }
})

// ── Vapi webhook (call status updates + recording) ────────────────────────────
// No auth — verified by HMAC signature from Vapi

router.post('/webhook/vapi', async (req, res, next) => {
  // Verify Vapi webhook signature
  const sig    = req.headers['x-vapi-secret'] as string | undefined
  const secret = process.env.VAPI_WEBHOOK_SECRET
  if (secret && sig !== secret) {
    res.sendStatus(403); return
  }

  res.sendStatus(200)  // ACK fast

  try {
    const event = req.body
    const vapiCallId: string = event.call?.id ?? event.callId
    if (!vapiCallId) return

    const record = await globalPrismaLookup(vapiCallId)
    if (!record) return

    const update: Record<string, unknown> = {}

    switch (event.type) {
      case 'call-started':
        update.status = 'IN_PROGRESS'
        break
      case 'call-ended':
        update.status          = mapEndReason(event.endedReason)
        update.endedAt         = new Date()
        update.durationSeconds = event.call?.endedAt
          ? Math.round((new Date(event.call.endedAt).getTime() - new Date(event.call.startedAt ?? event.call.createdAt).getTime()) / 1000)
          : undefined
        if (event.artifact?.recordingUrl) update.recordingUrl = event.artifact.recordingUrl
        if (event.artifact?.transcript)   update.transcript   = event.artifact.transcript
        break
      case 'transcript':
        // Incremental transcript update — append
        break
    }

    if (Object.keys(update).length) {
      await globalPrisma.callRecord.update({ where: { vapiCallId }, data: update })
    }
  } catch (err) { console.error('Vapi webhook error', err) }
})

function mapEndReason(reason?: string): string {
  if (!reason) return 'COMPLETED'
  if (reason.includes('no-answer') || reason.includes('timeout')) return 'NO_ANSWER'
  if (reason.includes('voicemail'))  return 'VOICEMAIL'
  if (reason.includes('error') || reason.includes('failed')) return 'FAILED'
  return 'COMPLETED'
}

import { PrismaClient } from '@crm/db'
const globalPrisma = new PrismaClient()

async function globalPrismaLookup(vapiCallId: string) {
  return globalPrisma.callRecord.findUnique({ where: { vapiCallId } })
}

export default router
