import { Router } from 'express'
import { z }       from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { requireRole }  from '../middleware/requireRole.js'

const router = Router()
router.use(authenticate)

// ── Categories ────────────────────────────────────────────────────────────────

router.get('/categories', async (req, res, next) => {
  try {
    const cats = await req.db.ticketCategory.findMany({ orderBy: { name: 'asc' } })
    res.json(cats)
  } catch (err) { next(err) }
})

router.post('/categories', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = z.object({ name: z.string().min(1).max(50), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1') }).parse(req.body)
    const cat  = await req.db.ticketCategory.create({ data: { ...body, tenantId: req.tenantId } })
    res.status(201).json(cat)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Tickets ───────────────────────────────────────────────────────────────────

const TicketSchema = z.object({
  subject:       z.string().min(1).max(300),
  priority:      z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  contactId:     z.string().optional(),
  conversationId: z.string().optional(),
  callRecordId:  z.string().optional(),
  categoryId:    z.string().optional(),
  assigneeId:    z.string().optional(),
})

router.get('/', async (req, res, next) => {
  try {
    const status   = req.query.status as string | undefined
    const priority = req.query.priority as string | undefined
    const page     = Math.max(1, Number(req.query.page ?? 1))
    const limit    = 25

    const where = {
      ...(status   ? { status:   status   as 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED' } : {}),
      ...(priority ? { priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' } : {}),
    }

    const [tickets, total] = await Promise.all([
      req.db.ticket.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip:    (page - 1) * limit,
        take:    limit,
        include: {
          contact:  { select: { id: true, name: true, email: true } },
          category: { select: { id: true, name: true, color: true } },
          assignee: { select: { id: true, name: true } },
          _count:   { select: { comments: true } },
        },
      }),
      req.db.ticket.count({ where }),
    ])

    res.json({ tickets, total, page, pages: Math.ceil(total / limit) })
  } catch (err) { next(err) }
})

router.post('/', async (req, res, next) => {
  try {
    const body = TicketSchema.parse(req.body)

    // Auto-increment ticket number per tenant
    const last = await req.db.ticket.findFirst({
      where:   { tenantId: req.tenantId },
      orderBy: { number: 'desc' },
      select:  { number: true },
    })
    const number = (last?.number ?? 0) + 1

    // SLA: set breach time based on priority
    const slaMinutes = { URGENT: 60, HIGH: 240, MEDIUM: 1440, LOW: 4320 }
    const slaBreachAt = new Date(Date.now() + (slaMinutes[body.priority] ?? 1440) * 60_000)

    const ticket = await req.db.ticket.create({
      data: { ...body, tenantId: req.tenantId, number, slaBreachAt },
      include: {
        contact:  { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } },
        assignee: { select: { id: true, name: true } },
      },
    })
    res.status(201).json(ticket)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const ticket = await req.db.ticket.findFirst({
      where:   { id: req.params.id },
      include: {
        contact:       { select: { id: true, name: true, email: true, phone: true } },
        conversation:  { select: { id: true, externalId: true, channelAccount: { select: { channel: true, name: true } } } },
        callRecord:    { select: { id: true, fromNumber: true, durationSeconds: true } },
        category:      { select: { id: true, name: true, color: true } },
        assignee:      { select: { id: true, name: true } },
        comments:      {
          orderBy: { createdAt: 'asc' },
          where:   { isInternalNote: false },  // exclude internal notes from default fetch
          include: { author: { select: { id: true, name: true } } },
        },
      },
    })
    if (!ticket) { res.status(404).json({ error: 'Ticket not found' }); return }
    res.json(ticket)
  } catch (err) { next(err) }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const body = TicketSchema.partial().extend({
      status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']).optional(),
    }).parse(req.body)
    const ticket = await req.db.ticket.update({ where: { id: req.params.id }, data: body })
    res.json(ticket)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Comments (includes internal notes) ───────────────────────────────────────

router.get('/:id/comments', async (req, res, next) => {
  try {
    const includeNotes = req.query.includeNotes === 'true'
    const comments = await req.db.ticketComment.findMany({
      where:   { ticketId: req.params.id, ...(!includeNotes ? { isInternalNote: false } : {}) },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, name: true } } },
    })
    res.json(comments)
  } catch (err) { next(err) }
})

router.post('/:id/comments', async (req, res, next) => {
  try {
    const body = z.object({
      body:          z.string().min(1),
      isInternalNote: z.boolean().default(false),
    }).parse(req.body)

    const comment = await req.db.ticketComment.create({
      data: {
        ticketId:      req.params.id,
        tenantId:      req.tenantId,
        body:          body.body,
        isInternalNote: body.isInternalNote,
        authorId:      req.userId,
      },
      include: { author: { select: { id: true, name: true } } },
    })

    // Update ticket status to in_progress when agent replies (but not for internal notes)
    if (!body.isInternalNote) {
      const ticket = await req.db.ticket.findFirst({ where: { id: req.params.id }, select: { status: true } })
      if (ticket?.status === 'OPEN') {
        await req.db.ticket.update({ where: { id: req.params.id }, data: { status: 'IN_PROGRESS' } })
      }
    }

    res.status(201).json(comment)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

export default router
