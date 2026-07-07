import { Router } from 'express'
import { z }       from 'zod'
import { authenticate } from '../middleware/authenticate.js'

const router = Router()
router.use(authenticate)

// ── Projects ──────────────────────────────────────────────────────────────────

const ProjectSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().optional(),
  status:      z.enum(['PLANNING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']).default('PLANNING'),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
  contactId:   z.string().optional(),
  dealId:      z.string().optional(),
  startDate:   z.string().datetime().optional(),
  dueDate:     z.string().datetime().optional(),
  budget:      z.number().nonnegative().optional(),
})

router.get('/', async (req, res, next) => {
  try {
    const projects = await req.db.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        contact: { select: { id: true, name: true } },
        _count:  { select: { tasks: true, timeEntries: true } },
      },
    })
    res.json(projects)
  } catch (err) { next(err) }
})

router.post('/', async (req, res, next) => {
  try {
    const body    = ProjectSchema.parse(req.body)
    const project = await req.db.project.create({
      data: {
        ...body,
        tenantId:  req.tenantId,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        dueDate:   body.dueDate   ? new Date(body.dueDate)   : undefined,
      },
      include: { contact: { select: { id: true, name: true } } },
    })
    res.status(201).json(project)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const project = await req.db.project.findFirst({
      where:   { id: req.params.id },
      include: {
        contact: { select: { id: true, name: true } },
        deal:    { select: { id: true, title: true } },
        tasks:   {
          where:   { parentId: null },  // top-level tasks only
          orderBy: [{ status: 'asc' }, { position: 'asc' }],
          include: {
            subtasks:  { orderBy: { position: 'asc' }, include: { assignee: { select: { id: true, name: true } } } },
            assignee:  { select: { id: true, name: true } },
            _count:    { select: { timeEntries: true } },
          },
        },
        _count: { select: { tasks: true, timeEntries: true } },
      },
    })
    if (!project) { res.status(404).json({ error: 'Project not found' }); return }
    res.json(project)
  } catch (err) { next(err) }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const body    = ProjectSchema.partial().parse(req.body)
    const project = await req.db.project.update({ where: { id: req.params.id }, data: body })
    res.json(project)
  } catch (err) { next(err) }
})

// ── Tasks ─────────────────────────────────────────────────────────────────────

const TaskSchema = z.object({
  title:            z.string().min(1).max(300),
  description:      z.string().optional(),
  status:           z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']).default('TODO'),
  priority:         z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  parentId:         z.string().optional(),
  assigneeId:       z.string().optional(),
  dueDate:          z.string().datetime().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
})

router.post('/:id/tasks', async (req, res, next) => {
  try {
    const body = TaskSchema.parse(req.body)

    // Enforce one-level subtask limit
    if (body.parentId) {
      const parent = await req.db.task.findFirst({ where: { id: body.parentId }, select: { parentId: true } })
      if (parent?.parentId) { res.status(400).json({ error: 'Subtasks cannot be nested deeper than one level' }); return }
    }

    const last = await req.db.task.findFirst({
      where:   { projectId: req.params.id, parentId: body.parentId ?? null },
      orderBy: { position: 'desc' },
      select:  { position: true },
    })

    const task = await req.db.task.create({
      data: {
        ...body,
        tenantId:  req.tenantId,
        projectId: req.params.id,
        position:  (last?.position ?? 0) + 1,
        dueDate:   body.dueDate ? new Date(body.dueDate) : undefined,
      },
      include: { assignee: { select: { id: true, name: true } } },
    })
    res.status(201).json(task)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.patch('/:projectId/tasks/:taskId', async (req, res, next) => {
  try {
    const body = TaskSchema.partial().parse(req.body)
    const task = await req.db.task.update({ where: { id: req.params.taskId }, data: body })
    res.json(task)
  } catch (err) { next(err) }
})

router.delete('/:projectId/tasks/:taskId', async (req, res, next) => {
  try {
    await req.db.task.delete({ where: { id: req.params.taskId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── Time tracking ─────────────────────────────────────────────────────────────

router.get('/:id/time', async (req, res, next) => {
  try {
    const entries = await req.db.timeEntry.findMany({
      where:   { projectId: req.params.id },
      orderBy: { startedAt: 'desc' },
      include: {
        user: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
    })
    res.json(entries)
  } catch (err) { next(err) }
})

router.post('/:id/time', async (req, res, next) => {
  try {
    const body = z.object({
      minutes:     z.number().int().positive(),
      description: z.string().optional(),
      startedAt:   z.string().datetime().optional(),
      taskId:      z.string().optional(),
    }).parse(req.body)

    const entry = await req.db.timeEntry.create({
      data: {
        projectId:   req.params.id,
        tenantId:    req.tenantId,
        userId:      req.userId,
        minutes:     body.minutes,
        description: body.description,
        startedAt:   body.startedAt ? new Date(body.startedAt) : new Date(),
        taskId:      body.taskId,
      },
      include: { user: { select: { id: true, name: true } }, task: { select: { id: true, title: true } } },
    })
    res.status(201).json(entry)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.patch('/:projectId/time/:entryId', async (req, res, next) => {
  try {
    // Locked once billed — cannot edit if billedLineItemId is set
    const existing = await req.db.timeEntry.findFirst({ where: { id: req.params.entryId }, select: { billedLineItemId: true } })
    if (existing?.billedLineItemId) { res.status(409).json({ error: 'Time entry is billed and cannot be edited' }); return }

    const body  = z.object({ minutes: z.number().int().positive().optional(), description: z.string().optional() }).parse(req.body)
    const entry = await req.db.timeEntry.update({ where: { id: req.params.entryId }, data: body })
    res.json(entry)
  } catch (err) { next(err) }
})

export default router
