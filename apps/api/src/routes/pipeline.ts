import { Router } from 'express'
import { z }       from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { requireRole }  from '../middleware/requireRole.js'

const router = Router()
router.use(authenticate)

const PipelineSchema = z.object({
  name:      z.string().min(1).max(200),
  isDefault: z.boolean().optional(),
})
const StageSchema = z.object({
  name:     z.string().min(1).max(200),
  position: z.number().int().min(0),
})

// ── Pipelines ─────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const pipelines = await req.db.pipeline.findMany({
      include: {
        stages: { orderBy: { position: 'asc' } },
        _count:  { select: { deals: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })
    res.json(pipelines)
  } catch (err) { next(err) }
})

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = PipelineSchema.parse(req.body)
    const pipeline = await req.db.pipeline.create({
      data: { ...body, tenantId: req.tenantId, stages: { create: [] } },
      include: { stages: true },
    })
    res.status(201).json(pipeline)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = PipelineSchema.partial().parse(req.body)
    const pipeline = await req.db.pipeline.update({ where: { id: req.params.id }, data: body })
    res.json(pipeline)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const pipeline = await req.db.pipeline.findFirst({ where: { id: req.params.id } })
    if (!pipeline) { res.status(404).json({ error: 'Pipeline not found' }); return }
    if (pipeline.isDefault) { res.status(409).json({ error: 'Cannot delete the default pipeline' }); return }
    await req.db.pipeline.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── Stages ────────────────────────────────────────────────────────────────────
router.post('/:pipelineId/stages', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = StageSchema.parse(req.body)
    const pipeline = await req.db.pipeline.findFirst({ where: { id: req.params.pipelineId } })
    if (!pipeline) { res.status(404).json({ error: 'Pipeline not found' }); return }

    const stage = await req.db.pipelineStage.create({
      data: { ...body, pipelineId: req.params.pipelineId },
    })
    res.status(201).json(stage)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.patch('/stages/:stageId', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = StageSchema.partial().parse(req.body)
    const stage = await req.db.pipelineStage.update({ where: { id: req.params.stageId }, data: body })
    res.json(stage)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.delete('/stages/:stageId', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const count = await req.db.deal.count({ where: { stageId: req.params.stageId } })
    if (count > 0) {
      res.status(409).json({ error: `Cannot delete stage: ${count} deals are in it. Move them first.` })
      return
    }
    await req.db.pipelineStage.delete({ where: { id: req.params.stageId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
