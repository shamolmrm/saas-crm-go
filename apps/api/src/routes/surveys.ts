import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

const QuestionSchema = z.object({
  id:       z.string().min(1),
  type:     z.enum(['nps','rating','text','choice','yesno']),
  question: z.string().min(1).max(300),
  options:  z.array(z.string()).optional(),
  required: z.boolean().default(true),
})

const SurveySchema = z.object({
  title:       z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  questions:   z.array(QuestionSchema).min(1).max(20),
  isActive:    z.boolean().default(true),
  thankYouMsg: z.string().max(300).optional(),
})

router.use(authenticate)

// List surveys
router.get('/', async (req, res, next) => {
  try {
    const surveys = await req.db.survey.findMany({
      where:   { tenantId: req.tenantId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { responses: true } } },
    })
    res.json(surveys)
  } catch (err) { next(err) }
})

// Get survey + responses + aggregate
router.get('/:id', async (req, res, next) => {
  try {
    const survey = await req.db.survey.findFirstOrThrow({
      where:   { id: req.params.id, tenantId: req.tenantId },
      include: {
        responses: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: { contact: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { responses: true } },
      },
    })

    // Compute aggregate per question
    const questions = survey.questions as { id: string; type: string }[]
    const aggregates: Record<string, unknown> = {}
    for (const q of questions) {
      const values = survey.responses.map((r: { answers: unknown }) => (r.answers as Record<string, unknown>)[q.id])
      if (q.type === 'nps' || q.type === 'rating') {
        const nums = values.filter(v => v != null).map(Number)
        aggregates[q.id] = {
          avg:   nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : null,
          count: nums.length,
          distribution: nums.reduce((acc, n) => { acc[n] = (acc[n] || 0) + 1; return acc }, {} as Record<number, number>),
        }
      } else if (q.type === 'choice' || q.type === 'yesno') {
        aggregates[q.id] = values.filter(v => v != null).reduce((acc: Record<string,number>, v) => {
          acc[String(v)] = (acc[String(v)] || 0) + 1; return acc
        }, {} as Record<string, number>)
      } else {
        aggregates[q.id] = values.filter(v => v != null)
      }
    }

    res.json({ ...survey, aggregates })
  } catch (err) { next(err) }
})

// Create
router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body   = SurveySchema.parse(req.body)
    const survey = await req.db.survey.create({
      data: { tenantId: req.tenantId, ...body },
    })
    res.status(201).json(survey)
  } catch (err) { next(err) }
})

// Update
router.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = SurveySchema.partial().parse(req.body)
    const n    = await req.db.survey.updateMany({
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
    await req.db.survey.deleteMany({ where: { id: req.params.id, tenantId: req.tenantId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
