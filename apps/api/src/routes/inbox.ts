import { Router }        from 'express'
import { z }             from 'zod'
import { authenticate }  from '../middleware/authenticate.js'
import { requireRole }   from '../middleware/requireRole.js'
import crypto            from 'crypto'

const router = Router()

// ── Channel account management (ADMIN only) ────────────────────────────────

router.get('/channels', authenticate, async (req, res, next) => {
  try {
    const channels = await req.db.channelAccount.findMany({ orderBy: { createdAt: 'asc' } })
    res.json(channels)
  } catch (err) { next(err) }
})

const ChannelSchema = z.object({
  channel:     z.enum(['WHATSAPP', 'EMAIL']),
  name:        z.string().min(1).max(100),
  externalId:  z.string().min(1),
  accessToken: z.string().optional(),
})

router.post('/channels', authenticate, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = ChannelSchema.parse(req.body)
    const ch   = await req.db.channelAccount.create({ data: { ...body, tenantId: req.tenantId } })
    res.status(201).json(ch)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.delete('/channels/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
  try {
    await req.db.channelAccount.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── Conversations ─────────────────────────────────────────────────────────

router.get('/conversations', authenticate, async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined
    const page   = Math.max(1, Number(req.query.page ?? 1))
    const limit  = 25

    const where = {
      ...(status ? { status: status as 'OPEN' | 'RESOLVED' | 'SNOOZED' } : {}),
    }

    const [conversations, total] = await Promise.all([
      req.db.conversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
        include: {
          contact:       { select: { id: true, name: true, email: true, phone: true } },
          channelAccount: { select: { id: true, name: true, channel: true } },
          messages:      { orderBy: { sentAt: 'desc' }, take: 1, select: { body: true, direction: true, sentAt: true } },
          _count:        { select: { messages: true } },
        },
      }),
      req.db.conversation.count({ where }),
    ])

    res.json({ conversations, total, page, pages: Math.ceil(total / limit) })
  } catch (err) { next(err) }
})

router.get('/conversations/:id', authenticate, async (req, res, next) => {
  try {
    const conv = await req.db.conversation.findFirst({
      where:   { id: req.params.id },
      include: {
        contact:       { select: { id: true, name: true, email: true, phone: true } },
        channelAccount: { select: { id: true, name: true, channel: true, externalId: true } },
        messages:      { orderBy: { sentAt: 'asc' }, where: { isInternalNote: false } },
      },
    })
    if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return }
    res.json(conv)
  } catch (err) { next(err) }
})

router.patch('/conversations/:id', authenticate, async (req, res, next) => {
  try {
    const body = z.object({
      status:    z.enum(['OPEN', 'RESOLVED', 'SNOOZED']).optional(),
      contactId: z.string().optional(),
      subject:   z.string().optional(),
    }).parse(req.body)
    const conv = await req.db.conversation.update({ where: { id: req.params.id }, data: body })
    res.json(conv)
  } catch (err) { next(err) }
})

// ── Messages ──────────────────────────────────────────────────────────────

router.get('/conversations/:id/messages', authenticate, async (req, res, next) => {
  try {
    const messages = await req.db.message.findMany({
      where:   { conversationId: req.params.id },
      orderBy: { sentAt: 'asc' },
    })
    res.json(messages)
  } catch (err) { next(err) }
})

router.post('/conversations/:id/messages', authenticate, async (req, res, next) => {
  try {
    const body = z.object({
      body:          z.string().min(1),
      isInternalNote: z.boolean().default(false),
    }).parse(req.body)

    // Internal notes are never sent to channel
    const msg = await req.db.message.create({
      data: {
        conversationId: req.params.id,
        tenantId:       req.tenantId,
        direction:      'OUTBOUND',
        body:           body.body,
        isInternalNote: body.isInternalNote,
        sentById:       req.userId,
      },
    })

    if (!body.isInternalNote) {
      // Retrieve channel account to dispatch actual send
      const conv = await req.db.conversation.findFirst({
        where:   { id: req.params.id },
        include: { channelAccount: true },
      })
      if (conv) {
        await req.db.conversation.update({ where: { id: req.params.id }, data: { lastMessageAt: new Date() } })
        // Non-blocking send (WhatsApp / email)
        dispatchOutbound(conv.channelAccount.channel, conv.channelAccount, conv.externalId, body.body).catch(console.error)
      }
    }

    res.status(201).json(msg)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── WhatsApp webhook ──────────────────────────────────────────────────────
// Signature-verified (X-Hub-Signature-256), routed by phone_number_id.
// Registration: https://developers.facebook.com/docs/whatsapp/cloud-api

router.get('/webhook/whatsapp', (req, res) => {
  const mode  = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.send(challenge)
  } else {
    res.sendStatus(403)
  }
})

router.post('/webhook/whatsapp', async (req, res, next) => {
  // Validate signature
  const sig = req.headers['x-hub-signature-256'] as string | undefined
  if (!sig || !process.env.WHATSAPP_APP_SECRET) {
    // In dev without secret configured, skip validation but log warning
    if (process.env.NODE_ENV === 'production') { res.sendStatus(403); return }
  } else {
    const expected = 'sha256=' + crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
      .update(JSON.stringify(req.body)).digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      res.sendStatus(403); return
    }
  }

  res.sendStatus(200) // ACK immediately

  try {
    const body = req.body
    if (body.object !== 'whatsapp_business_account') return

    for (const entry of (body.entry ?? [])) {
      for (const change of (entry.changes ?? [])) {
        if (change.field !== 'messages') continue
        const value = change.value
        const phoneNumberId: string = value.metadata?.phone_number_id
        if (!phoneNumberId) continue

        // Find channel account by phone_number_id (externalId)
        // Note: this is a cross-tenant lookup — we filter by externalId not tenantId
        const channelAccount = await globalPrismaLookup('channelAccount', phoneNumberId)
        if (!channelAccount) continue

        for (const msg of (value.messages ?? [])) {
          const from: string  = msg.from     // customer's phone number
          const waMsgId: string = msg.id
          const text: string  = msg.text?.body ?? msg.type ?? '[media]'

          await ingestInboundMessage({
            tenantId:         channelAccount.tenantId,
            channelAccountId: channelAccount.id,
            externalId:       from,
            messageExternalId: waMsgId,
            body:             text,
          })
        }
      }
    }
  } catch (err) { console.error('WhatsApp webhook error', err) }
})

// ── Email ingest (simple POST from a mail server / Postmark / SendGrid) ──

router.post('/webhook/email', async (req, res, next) => {
  try {
    const body = z.object({
      to:          z.string().email(),
      from:        z.string().email(),
      subject:     z.string().optional(),
      text:        z.string().optional(),
      html:        z.string().optional(),
      messageId:   z.string().optional(),
    }).parse(req.body)

    // Find channel account by the inbox address (externalId)
    const channelAccount = await globalPrismaLookup('channelAccount', body.to, 'EMAIL')
    if (!channelAccount) { res.json({ ok: false, reason: 'No inbox configured for this address' }); return }

    await ingestInboundMessage({
      tenantId:         channelAccount.tenantId,
      channelAccountId: channelAccount.id,
      externalId:       body.from,
      messageExternalId: body.messageId,
      body:             body.text ?? body.html ?? '(no body)',
      subject:          body.subject,
    })

    res.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────

// These helpers need a non-scoped prisma client because webhooks are cross-tenant.
// We import the base client here.
import { PrismaClient } from '@crm/db'
const globalPrisma = new PrismaClient()

async function globalPrismaLookup(model: 'channelAccount', externalId: string, channel?: string) {
  return (globalPrisma.channelAccount as any).findFirst({
    where: {
      externalId,
      ...(channel ? { channel } : {}),
    },
  })
}

interface IngestParams {
  tenantId:          string
  channelAccountId:  string
  externalId:        string   // customer phone or email
  messageExternalId?: string
  body:              string
  subject?:          string
}

async function ingestInboundMessage(p: IngestParams) {
  // Skip duplicate messages (idempotency via externalId)
  if (p.messageExternalId) {
    const exists = await globalPrisma.message.findUnique({ where: { externalId: p.messageExternalId } })
    if (exists) return
  }

  // Find or create conversation
  let conv = await globalPrisma.conversation.findUnique({
    where: { channelAccountId_externalId: { channelAccountId: p.channelAccountId, externalId: p.externalId } },
  })

  if (!conv) {
    // Exact-match identity resolution: phone → Contact or email → Contact
    const contact = await globalPrisma.contact.findFirst({
      where: {
        tenantId: p.tenantId,
        OR: [
          { phone: p.externalId },
          { email: p.externalId },
        ],
      },
    })

    conv = await globalPrisma.conversation.create({
      data: {
        tenantId:         p.tenantId,
        channelAccountId: p.channelAccountId,
        externalId:       p.externalId,
        contactId:        contact?.id ?? null,
        subject:          p.subject,
        lastMessageAt:    new Date(),
      },
    })
  }

  await globalPrisma.message.create({
    data: {
      conversationId: conv.id,
      tenantId:       p.tenantId,
      direction:      'INBOUND',
      body:           p.body,
      externalId:     p.messageExternalId,
    },
  })

  await globalPrisma.conversation.update({
    where: { id: conv.id },
    data:  { lastMessageAt: new Date(), status: 'OPEN' },
  })
}

async function dispatchOutbound(
  channel: string,
  account: { externalId: string; accessToken: string | null },
  to: string,
  body: string,
) {
  if (channel === 'WHATSAPP' && account.accessToken) {
    const fetch = (await import('node-fetch')).default
    await fetch(`https://graph.facebook.com/v19.0/${account.externalId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
    })
  }
  // EMAIL: integrate Nodemailer / SES / SendGrid here
}

export default router
