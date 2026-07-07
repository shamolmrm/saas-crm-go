import { Router } from 'express'
import { z }       from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { requireRole }  from '../middleware/requireRole.js'

const router = Router()
router.use(authenticate)

// ── Service Types ─────────────────────────────────────────────────────────────

router.get('/service-types', async (req, res, next) => {
  try {
    const types = await req.db.serviceType.findMany({ orderBy: { name: 'asc' } })
    res.json(types)
  } catch (err) { next(err) }
})

const ServiceTypeSchema = z.object({
  name:            z.string().min(1).max(100),
  durationMinutes: z.number().int().min(5).max(480).default(30),
  color:           z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
  isActive:        z.boolean().default(true),
})

router.post('/service-types', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = ServiceTypeSchema.parse(req.body)
    const st   = await req.db.serviceType.create({ data: { ...body, tenantId: req.tenantId } })
    res.status(201).json(st)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.patch('/service-types/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = ServiceTypeSchema.partial().parse(req.body)
    const st   = await req.db.serviceType.update({ where: { id: req.params.id }, data: body })
    res.json(st)
  } catch (err) { next(err) }
})

router.delete('/service-types/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await req.db.serviceType.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── Appointments ──────────────────────────────────────────────────────────────

const AppointmentSchema = z.object({
  title:          z.string().min(1).max(200),
  startsAt:       z.string().datetime(),  // ISO UTC
  endsAt:         z.string().datetime(),  // ISO UTC
  ianaTz:         z.string().default('UTC'),
  contactId:      z.string().optional(),
  dealId:         z.string().optional(),
  serviceTypeId:  z.string().optional(),
  assignedUserId: z.string().optional(),
  notes:          z.string().optional(),
  location:       z.string().optional(),
})

router.get('/', async (req, res, next) => {
  try {
    const from   = req.query.from   ? new Date(req.query.from as string) : new Date()
    const to     = req.query.to     ? new Date(req.query.to   as string) : new Date(Date.now() + 30 * 86400_000)
    const userId = req.query.userId as string | undefined

    const appointments = await req.db.appointment.findMany({
      where: {
        startsAt: { gte: from, lte: to },
        ...(userId ? { assignedUserId: userId } : {}),
      },
      orderBy: { startsAt: 'asc' },
      include: {
        contact:     { select: { id: true, name: true, email: true, phone: true } },
        serviceType: { select: { id: true, name: true, color: true, durationMinutes: true } },
        assignedUser:{ select: { id: true, name: true } },
      },
    })
    res.json(appointments)
  } catch (err) { next(err) }
})

router.get('/:id', async (req, res, next) => {
  try {
    const appt = await req.db.appointment.findFirst({
      where:   { id: req.params.id },
      include: {
        contact:      { select: { id: true, name: true, email: true, phone: true } },
        deal:         { select: { id: true, title: true } },
        serviceType:  { select: { id: true, name: true, color: true, durationMinutes: true } },
        assignedUser: { select: { id: true, name: true } },
      },
    })
    if (!appt) { res.status(404).json({ error: 'Appointment not found' }); return }
    res.json(appt)
  } catch (err) { next(err) }
})

router.post('/', async (req, res, next) => {
  try {
    const body   = AppointmentSchema.parse(req.body)
    const starts = new Date(body.startsAt)
    const ends   = new Date(body.endsAt)

    if (ends <= starts) { res.status(400).json({ error: 'endsAt must be after startsAt' }); return }

    // DB-level double-booking prevention: check + create in a transaction
    const appt = await req.db.$transaction(async (tx) => {
      if (body.assignedUserId) {
        const overlap = await tx.appointment.findFirst({
          where: {
            assignedUserId: body.assignedUserId,
            status:         { notIn: ['CANCELLED'] },
            OR: [
              { startsAt: { gte: starts, lt: ends } },
              { endsAt:   { gt: starts, lte: ends } },
              { startsAt: { lte: starts }, endsAt: { gte: ends } },
            ],
          },
        })
        if (overlap) throw new ConflictError(`Time slot conflicts with existing appointment "${overlap.title}"`)
      }

      return tx.appointment.create({
        data: {
          ...body,
          startsAt: starts,
          endsAt:   ends,
          tenantId: req.tenantId,
        },
        include: {
          contact:     { select: { id: true, name: true } },
          serviceType: { select: { id: true, name: true, color: true } },
        },
      })
    })

    res.status(201).json(appt)
  } catch (err) {
    if (err instanceof ConflictError) { res.status(409).json({ error: err.message }); return }
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const body = AppointmentSchema.partial().extend({
      status: z.enum(['SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']).optional(),
    }).parse(req.body)

    const data: Record<string, unknown> = { ...body }
    if (body.startsAt) data.startsAt = new Date(body.startsAt)
    if (body.endsAt)   data.endsAt   = new Date(body.endsAt)

    const appt = await req.db.appointment.update({ where: { id: req.params.id }, data })
    res.json(appt)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    await req.db.appointment.update({
      where: { id: req.params.id },
      data:  { status: 'CANCELLED' },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── Availability check ────────────────────────────────────────────────────────

router.get('/availability/:userId', async (req, res, next) => {
  try {
    const from = new Date(req.query.from as string ?? new Date().toISOString())
    const to   = new Date(req.query.to   as string ?? new Date(Date.now() + 7 * 86400_000).toISOString())

    const busySlots = await req.db.appointment.findMany({
      where: {
        assignedUserId: req.params.userId,
        status:         { notIn: ['CANCELLED'] },
        startsAt:       { gte: from },
        endsAt:         { lte: to },
      },
      select: { startsAt: true, endsAt: true, title: true },
      orderBy: { startsAt: 'asc' },
    })

    res.json({ userId: req.params.userId, from, to, busySlots })
  } catch (err) { next(err) }
})

class ConflictError extends Error {}

export default router
