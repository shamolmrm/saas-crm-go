import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

const CampaignSchema = z.object({
  name:    z.string().min(1).max(120),
  channel: z.enum(['email', 'whatsapp']),
  subject: z.string().max(200).optional(),
  body:    z.string().min(1).max(5000),
  filter:  z.object({
    company:  z.string().optional(),
    hasEmail: z.boolean().optional(),
    hasPhone: z.boolean().optional(),
  }).default({}),
})

router.use(authenticate)

// List campaigns
router.get('/', async (req, res, next) => {
  try {
    const campaigns = await req.db.campaign.findMany({
      where:   { tenantId: req.tenantId },
      orderBy: { createdAt: 'desc' },
    })
    res.json(campaigns)
  } catch (err) { next(err) }
})

// Get single
router.get('/:id', async (req, res, next) => {
  try {
    const c = await req.db.campaign.findFirstOrThrow({
      where: { id: req.params.id, tenantId: req.tenantId },
    })
    res.json(c)
  } catch (err) { next(err) }
})

// Create
router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body     = CampaignSchema.parse(req.body)
    const campaign = await req.db.campaign.create({
      data: { tenantId: req.tenantId, ...body },
    })
    res.status(201).json(campaign)
  } catch (err) { next(err) }
})

// Update
router.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = CampaignSchema.partial().parse(req.body)
    const c    = await req.db.campaign.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } })
    if (!c) return res.status(404).json({ error: 'Not found' })
    if (c.status !== 'DRAFT') return res.status(400).json({ error: 'Can only edit DRAFT campaigns' })
    await req.db.campaign.update({ where: { id: req.params.id }, data: body })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// Delete
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await req.db.campaign.deleteMany({ where: { id: req.params.id, tenantId: req.tenantId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// Preview — get matching contacts
router.post('/:id/preview', async (req, res, next) => {
  try {
    const c = await req.db.campaign.findFirstOrThrow({
      where: { id: req.params.id, tenantId: req.tenantId },
    })
    const filter = c.filter as { company?: string; hasEmail?: boolean; hasPhone?: boolean }
    const where: Record<string, unknown> = { tenantId: req.tenantId }
    if (filter.company)  where.company = { contains: filter.company, mode: 'insensitive' }
    if (filter.hasEmail) where.email   = { not: null }
    if (filter.hasPhone) where.phone   = { not: null }
    const contacts = await req.db.contact.findMany({
      where, take: 20,
      select: { id: true, name: true, email: true, phone: true, company: true },
    })
    const total = await req.db.contact.count({ where })
    res.json({ total, sample: contacts })
  } catch (err) { next(err) }
})

// Send campaign
router.post('/:id/send', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const c = await req.db.campaign.findFirstOrThrow({
      where: { id: req.params.id, tenantId: req.tenantId },
    })
    if (c.status !== 'DRAFT') return res.status(400).json({ error: 'Already sent' })

    const filter = c.filter as { company?: string; hasEmail?: boolean; hasPhone?: boolean }
    const where: Record<string, unknown> = { tenantId: req.tenantId }
    if (filter.company)  where.company = { contains: filter.company, mode: 'insensitive' }
    if (c.channel === 'email' || filter.hasEmail) where.email = { not: null }
    if (c.channel === 'whatsapp' || filter.hasPhone) where.phone = { not: null }

    const contacts = await req.db.contact.findMany({ where })

    await req.db.campaign.update({
      where: { id: c.id },
      data:  { status: 'SENDING', totalContacts: contacts.length },
    })

    // Async send — fire and forget, update counts after
    sendCampaignMessages(req.db, c, contacts, req.tenantId).catch(console.error)

    res.json({ ok: true, queued: contacts.length })
  } catch (err) { next(err) }
})

// ── Async send helper ─────────────────────────────────────────────────────────
async function sendCampaignMessages(
  db: any,
  campaign: { id: string; channel: string; body: string; subject?: string | null },
  contacts: { id: string; name: string; email?: string | null; phone?: string | null }[],
  tenantId: string,
) {
  let sent = 0; let failed = 0

  // Get channel account for WhatsApp
  let channelAccount: { id: string; phoneNumberId?: string | null; accessToken?: string | null } | null = null
  if (campaign.channel === 'whatsapp') {
    channelAccount = await (db as any).channelAccount.findFirst({
      where: { tenantId, type: 'WHATSAPP', isActive: true },
    })
  }

  for (const contact of contacts) {
    try {
      if (campaign.channel === 'whatsapp' && contact.phone && channelAccount) {
        // Send WhatsApp message via Cloud API
        const phoneId = (channelAccount as any).phoneNumberId
        const token   = (channelAccount as any).accessToken
        if (phoneId && token) {
          const phone = contact.phone.replace(/\D/g, '')
          const resp  = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: phone,
              type: 'text',
              text: { body: campaign.body.replace(/\{name\}/g, contact.name) },
            }),
          })
          if (resp.ok) sent++; else failed++
        } else { failed++ }
      } else if (campaign.channel === 'email' && contact.email) {
        // Create an outbound conversation/email record
        const existing = await (db as any).conversation.findFirst({
          where: { tenantId, contactId: contact.id, channel: 'EMAIL' },
        })
        const convId = existing?.id ?? (await (db as any).conversation.create({
          data: { tenantId, contactId: contact.id, channel: 'EMAIL', status: 'OPEN' },
        })).id
        await (db as any).message.create({
          data: {
            tenantId, conversationId: convId,
            direction: 'OUTBOUND',
            body: `**Subject:** ${campaign.subject ?? campaign.body.substring(0, 60)}\n\n${campaign.body.replace(/\{name\}/g, contact.name)}`,
          },
        })
        sent++
      } else { failed++ }
    } catch { failed++ }
  }

  await (db as any).campaign.update({
    where: { id: campaign.id },
    data: { status: 'SENT', totalSent: sent, totalFailed: failed, sentAt: new Date() },
  })
}

export default router
