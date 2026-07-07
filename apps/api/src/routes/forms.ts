import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

// ── Field schema ──────────────────────────────────────────────────────────────
const FieldSchema = z.object({
  id:          z.string().min(1),
  type:        z.enum(['text','email','tel','number','textarea','select','checkbox','url']),
  label:       z.string().min(1).max(100),
  placeholder: z.string().max(100).optional(),
  required:    z.boolean().default(false),
  options:     z.array(z.string()).optional(), // for select
})

const FormSchema = z.object({
  title:         z.string().min(1).max(120),
  description:   z.string().max(500).optional(),
  fields:        z.array(FieldSchema).min(1).max(20),
  isActive:      z.boolean().default(true),
  createContact: z.boolean().default(true),
})

// ── Authenticated CRUD ────────────────────────────────────────────────────────
router.use(authenticate)

// List forms
router.get('/', async (req, res, next) => {
  try {
    const forms = await req.db.form.findMany({
      where:   { tenantId: req.tenantId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { submissions: true } } },
    })
    res.json(forms)
  } catch (err) { next(err) }
})

// Get single form with submissions
router.get('/:id', async (req, res, next) => {
  try {
    const form = await req.db.form.findFirstOrThrow({
      where:   { id: req.params.id, tenantId: req.tenantId },
      include: {
        submissions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { contact: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { submissions: true } },
      },
    })
    res.json(form)
  } catch (err) { next(err) }
})

// Create form
router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = FormSchema.parse(req.body)
    const form = await req.db.form.create({
      data: { tenantId: req.tenantId, ...body },
    })
    res.status(201).json(form)
  } catch (err) { next(err) }
})

// Update form
router.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = FormSchema.partial().parse(req.body)
    const form = await req.db.form.updateMany({
      where: { id: req.params.id, tenantId: req.tenantId },
      data:  body,
    })
    if (form.count === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// Delete form
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await req.db.form.deleteMany({ where: { id: req.params.id, tenantId: req.tenantId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
