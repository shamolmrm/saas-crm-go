import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

const PageSchema = z.object({
  title:       z.string().min(1).max(120),
  slug:        z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Slug: lowercase letters, numbers, hyphens only'),
  headline:    z.string().min(1).max(200),
  subheadline: z.string().max(500).optional(),
  heroImageUrl:z.string().url().optional().or(z.literal('')),
  brandColor:  z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#7C3AED'),
  ctaText:     z.string().max(50).default('Get Started'),
  ctaAction:   z.enum(['form','booking','url']).default('form'),
  ctaTarget:   z.string().optional(),
  formFields:  z.any().optional(),
  published:   z.boolean().default(false),
})

router.use(authenticate)

// List
router.get('/', async (req, res, next) => {
  try {
    const pages = await req.db.landingPage.findMany({
      where:   { tenantId: req.tenantId },
      orderBy: { createdAt: 'desc' },
    })
    res.json(pages)
  } catch (err) { next(err) }
})

// Get single
router.get('/:id', async (req, res, next) => {
  try {
    const page = await req.db.landingPage.findFirstOrThrow({
      where: { id: req.params.id, tenantId: req.tenantId },
    })
    res.json(page)
  } catch (err) { next(err) }
})

// Create
router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = PageSchema.parse(req.body)
    // Check slug uniqueness
    const existing = await req.db.landingPage.findUnique({ where: { slug: body.slug } })
    if (existing) return res.status(400).json({ error: 'Slug already taken — try a different URL' })
    const page = await req.db.landingPage.create({
      data: { tenantId: req.tenantId, ...body },
    })
    res.status(201).json(page)
  } catch (err) { next(err) }
})

// Update
router.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = PageSchema.partial().parse(req.body)
    if (body.slug) {
      const conflict = await req.db.landingPage.findFirst({
        where: { slug: body.slug, id: { not: req.params.id } },
      })
      if (conflict) return res.status(400).json({ error: 'Slug already taken' })
    }
    const n = await req.db.landingPage.updateMany({
      where: { id: req.params.id, tenantId: req.tenantId },
      data:  body,
    })
    if (n.count === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// Delete
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await req.db.landingPage.deleteMany({ where: { id: req.params.id, tenantId: req.tenantId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
