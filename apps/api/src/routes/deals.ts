import { Router } from 'express'
import { z }                  from 'zod'
import { prisma, type Prisma } from '@crm/db'
import { authenticate } from '../middleware/authenticate.js'
import { requireRole }  from '../middleware/requireRole.js'

const router = Router()
router.use(authenticate)

const DealSchema = z.object({
  title:      z.string().min(1).max(500),
  value:      z.number().positive().optional(),
  currency:   z.string().length(3).default('USD'),
  pipelineId: z.string(),
  stageId:    z.string(),
  contactId:  z.string().optional(),
  ownerId:    z.string().optional(),
  status:     z.enum(['OPEN', 'WON', 'LOST']).optional(),
})

// ── List ──────────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { pipelineId, stageId, status, ownerId } = req.query as Record<string, string>

    const where: Prisma.DealWhereInput = {}
    if (pipelineId) where.pipelineId = pipelineId
    if (stageId)    where.stageId    = stageId
    if (status)     where.status     = status as 'OPEN' | 'WON' | 'LOST'
    if (ownerId)    where.ownerId    = ownerId

    const deals = await req.db.deal.findMany({
      where,
      include: {
        contact: { select: { id: true, name: true, email: true } },
        stage:   { select: { id: true, name: true, position: true } },
        owner:   { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: [{ stageId: 'asc' }, { position: 'asc' }],
    })

    res.json(deals)
  } catch (err) { next(err) }
})

// ── Get pipeline board (grouped by stage for Kanban) ─────────────────────────
router.get('/board/:pipelineId', async (req, res, next) => {
  try {
    const pipeline = await req.db.pipeline.findFirst({
      where: { id: req.params.pipelineId },
      include: {
        stages: {
          orderBy: { position: 'asc' },
          include: {
            deals: {
              where:   { status: 'OPEN' },
              include: {
                contact: { select: { id: true, name: true, email: true } },
                owner:   { select: { id: true, name: true, avatarUrl: true } },
              },
              orderBy: { position: 'asc' },
            },
          },
        },
      },
    })
    if (!pipeline) { res.status(404).json({ error: 'Pipeline not found' }); return }
    res.json(pipeline)
  } catch (err) { next(err) }
})

// ── Create ────────────────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const body = DealSchema.parse(req.body)

    // Verify stage belongs to pipeline (and belongs to this tenant via scopedPrisma)
    const stage = await req.db.pipelineStage.findFirst({
      where: { id: body.stageId, pipelineId: body.pipelineId },
    })
    if (!stage) { res.status(400).json({ error: 'Stage does not belong to this pipeline' }); return }

    // Place at end of stage
    const lastDeal = await req.db.deal.findFirst({
      where:   { stageId: body.stageId },
      orderBy: { position: 'desc' },
      select:  { position: true },
    })
    const position = (lastDeal?.position ?? -1) + 1

    const deal = await req.db.deal.create({
      data: { ...body, position, tenantId: req.tenantId },
      include: {
        contact: { select: { id: true, name: true } },
        stage:   true,
      },
    })
    res.status(201).json(deal)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Get one ───────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const deal = await req.db.deal.findFirst({
      where: { id: req.params.id },
      include: {
        contact:    { select: { id: true, name: true, email: true, company: true } },
        stage:      true,
        pipeline:   { select: { id: true, name: true } },
        owner:      { select: { id: true, name: true, avatarUrl: true } },
        activities: { orderBy: { occurredAt: 'desc' }, take: 50 },
      },
    })
    if (!deal) { res.status(404).json({ error: 'Deal not found' }); return }
    res.json(deal)
  } catch (err) { next(err) }
})

// ── Update ────────────────────────────────────────────────────────────────────
router.patch('/:id', async (req, res, next) => {
  try {
    const body = DealSchema.partial().parse(req.body)
    const deal = await req.db.deal.update({
      where: { id: req.params.id },
      data:  {
        ...body,
        closedAt: body.status === 'WON' || body.status === 'LOST'
          ? new Date()
          : undefined,
      },
      include: { stage: true, contact: { select: { id: true, name: true } } },
    })
    res.json(deal)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Move (Kanban drag-and-drop) ───────────────────────────────────────────────
router.patch('/:id/move', async (req, res, next) => {
  try {
    const { stageId, newPosition } = z.object({
      stageId:     z.string(),
      newPosition: z.number().int().min(0),
    }).parse(req.body)

    const tenantId = req.tenantId
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const deal = await tx.deal.findFirst({ where: { id: req.params.id, tenantId } })
      if (!deal) return

      // Shift deals in the target column to make room (scoped to this tenant)
      await tx.deal.updateMany({
        where: {
          tenantId,
          stageId,
          position: { gte: newPosition },
          id:       { not: req.params.id },
        },
        data: { position: { increment: 1 } },
      })

      await tx.deal.update({
        where: { id: req.params.id },
        data:  { stageId, position: newPosition },
      })
    })

    res.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await req.db.deal.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
