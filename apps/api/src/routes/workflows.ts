import { Router } from 'express'
import { z }       from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { requireRole }  from '../middleware/requireRole.js'
import { workflowQueue } from '../workers/workflowWorker.js'

const router = Router()
router.use(authenticate)

const WorkflowSchema = z.object({
  name:       z.string().min(1).max(200),
  definition: z.object({
    nodes: z.array(z.object({
      id:   z.string(),
      type: z.enum(['TRIGGER', 'CONDITION', 'DELAY', 'ACTION']),
      data: z.record(z.unknown()),
      next: z.array(z.string()).optional(),
    })),
    edges: z.array(z.object({
      source: z.string(),
      target: z.string(),
      label:  z.string().optional(),
    })),
  }),
})

router.get('/', async (req, res, next) => {
  try {
    const workflows = await req.db.workflowDefinition.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { runs: true } } },
    })
    res.json(workflows)
  } catch (err) { next(err) }
})

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = WorkflowSchema.parse(req.body)
    const workflow = await req.db.workflowDefinition.create({ data: { ...body, tenantId: req.tenantId } })
    res.status(201).json(workflow)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const workflow = await req.db.workflowDefinition.findFirst({
      where:   { id: req.params.id },
      include: { _count: { select: { runs: true } } },
    })
    if (!workflow) { res.status(404).json({ error: 'Workflow not found' }); return }
    res.json(workflow)
  } catch (err) { next(err) }
})

router.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = WorkflowSchema.partial().parse(req.body)
    const workflow = await req.db.workflowDefinition.update({
      where: { id: req.params.id },
      data:  body,
    })
    res.json(workflow)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await req.db.workflowDefinition.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.post('/:id/activate', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const workflow = await req.db.workflowDefinition.update({
      where: { id: req.params.id },
      data:  { isActive: true },
    })
    res.json(workflow)
  } catch (err) { next(err) }
})

router.post('/:id/deactivate', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const workflow = await req.db.workflowDefinition.update({
      where: { id: req.params.id },
      data:  { isActive: false },
    })
    res.json(workflow)
  } catch (err) { next(err) }
})

router.get('/:id/runs', async (req, res, next) => {
  try {
    const runs = await req.db.workflowRun.findMany({
      where:   { workflowDefinitionId: req.params.id },
      orderBy: { startedAt: 'desc' },
      take:    50,
    })
    res.json(runs)
  } catch (err) { next(err) }
})

export default router
