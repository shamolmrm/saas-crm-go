import { Router } from 'express'
import { z }       from 'zod'
import { authenticate }   from '../middleware/authenticate.js'
import { requireRole }    from '../middleware/requireRole.js'
import type { Prisma }    from '@crm/db'

const router = Router()
router.use(authenticate)

const ContactSchema = z.object({
  name:     z.string().min(1).max(200),
  email:    z.string().email().optional().or(z.literal('')),
  phone:    z.string().max(50).optional(),
  company:  z.string().max(200).optional(),
  jobTitle: z.string().max(200).optional(),
  notes:    z.string().max(10000).optional(),
})

// ── List ──────────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { search, company, page = '1', limit = '50' } = req.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const where: Prisma.ContactWhereInput = {}
    if (search) {
      where.OR = [
        { name:    { contains: search, mode: 'insensitive' } },
        { email:   { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (company) where.company = { equals: company, mode: 'insensitive' }

    const [contacts, total] = await Promise.all([
      req.db.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
        select: {
          id: true, name: true, email: true, phone: true,
          company: true, jobTitle: true, createdAt: true,
          _count: { select: { deals: true } },
        },
      }),
      req.db.contact.count({ where }),
    ])

    res.json({ contacts, total, page: Number(page), limit: Number(limit) })
  } catch (err) { next(err) }
})

// ── Create ────────────────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const body = ContactSchema.parse(req.body)
    const contact = await req.db.contact.create({ data: { ...body, tenantId: req.tenantId } })
    res.status(201).json(contact)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Get one ───────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const contact = await req.db.contact.findFirst({
      where: { id: req.params.id },
      include: {
        deals:      { include: { stage: true }, orderBy: { createdAt: 'desc' } },
        activities: { orderBy: { occurredAt: 'desc' }, take: 50 },
      },
    })
    if (!contact) { res.status(404).json({ error: 'Contact not found' }); return }
    res.json(contact)
  } catch (err) { next(err) }
})

// ── Update ────────────────────────────────────────────────────────────────────
router.patch('/:id', async (req, res, next) => {
  try {
    const body = ContactSchema.partial().parse(req.body)
    const contact = await req.db.contact.update({
      where: { id: req.params.id },
      data:  body,
    })
    res.json(contact)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await req.db.contact.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── Log activity ──────────────────────────────────────────────────────────────
router.post('/:id/activities', async (req, res, next) => {
  try {
    const body = z.object({
      type:    z.enum(['NOTE', 'EMAIL', 'CALL', 'MEETING', 'TASK']),
      subject: z.string().max(500).optional(),
      body:    z.string().max(10000).optional(),
      occurredAt: z.string().datetime().optional(),
    }).parse(req.body)

    const contact = await req.db.contact.findFirst({ where: { id: req.params.id } })
    if (!contact) { res.status(404).json({ error: 'Contact not found' }); return }

    const activity = await req.db.activity.create({
      data: {
        tenantId:  req.tenantId,
        contactId: req.params.id,
        userId:    req.userId,
        type:      body.type,
        subject:   body.subject,
        body:      body.body,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
      },
    })
    res.status(201).json(activity)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

export default router
