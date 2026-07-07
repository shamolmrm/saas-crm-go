import { Router }     from 'express'
import { z }          from 'zod'
import rateLimit      from 'express-rate-limit'
import { authenticate }              from '../middleware/authenticate.js'
import { generateContactSummary, copilotSearch } from '../services/aiService.js'

const router = Router()
router.use(authenticate)

// Tighter rate limits on AI routes for cost control
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'AI request rate limit reached. Try again in a minute.' },
})

// ── Contact AI Summary ────────────────────────────────────────────────────────
router.post('/contact-summary/:contactId', aiLimiter, async (req, res, next) => {
  try {
    const summary = await generateContactSummary(req.db, req.params.contactId)

    // Persist the summary back to the contact record
    await req.db.contact.update({
      where: { id: req.params.contactId },
      data:  { aiSummary: summary, aiSummaryAt: new Date() },
    })

    res.json({ summary })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    // Surface OpenAI errors as 502 (upstream failure), not 500
    if (msg.includes('OpenAI') || msg.includes('rate limit') || msg.includes('timeout')) {
      res.status(502).json({ error: 'AI service temporarily unavailable. Try again in a moment.' })
      return
    }
    next(err)
  }
})

// ── AI Copilot Search ─────────────────────────────────────────────────────────
router.post('/search', aiLimiter, async (req, res, next) => {
  try {
    const { query } = z.object({
      query: z.string().min(1).max(500),
    }).parse(req.body)

    const result = await copilotSearch(req.db, query)
    res.json(result)
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'query is required (max 500 chars)', issues: err.issues })
      return
    }
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('invalid search parameters') || msg.includes('did not return')) {
      res.status(422).json({ error: 'Could not interpret that search. Try rephrasing.' })
      return
    }
    next(err)
  }
})

export default router
