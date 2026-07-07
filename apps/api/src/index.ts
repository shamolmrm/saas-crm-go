import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import authRouter     from './routes/auth.js'
import contactsRouter from './routes/contacts.js'
import dealsRouter    from './routes/deals.js'
import pipelineRouter from './routes/pipeline.js'
import aiRouter       from './routes/ai.js'
import workflowRouter from './routes/workflows.js'
import teamRouter     from './routes/team.js'
import inviteRouter   from './routes/invite.js'
import inboxRouter    from './routes/inbox.js'
import leadsRouter    from './routes/leads.js'
import bookingsRouter from './routes/bookings.js'
import voiceRouter    from './routes/voice.js'
import ticketsRouter  from './routes/tickets.js'
import invoicesRouter  from './routes/invoices.js'
import inventoryRouter from './routes/inventory.js'
import projectsRouter  from './routes/projects.js'
import hrRouter           from './routes/hr.js'
import analyticsRouter    from './routes/analytics.js'
import formsRouter        from './routes/forms.js'
import campaignsRouter    from './routes/campaigns.js'
import surveysRouter      from './routes/surveys.js'
import landingPagesRouter from './routes/landingPages.js'
import publicRouter       from './routes/public.js'
import { startWorkflowWorker } from './workers/workflowWorker.js'

const app = express()

app.use(helmet())
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : /^http:\/\/localhost:\d+$/,
  credentials: true,
}))
app.use(express.json({ limit: '1mb' }))

// Global rate limit — tighter limits applied per-router on AI routes
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again in a moment.' },
}))

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/auth',      authRouter)
app.use('/contacts',  contactsRouter)
app.use('/deals',     dealsRouter)
app.use('/pipeline',  pipelineRouter)
app.use('/ai',        aiRouter)
app.use('/workflows', workflowRouter)
app.use('/team',      teamRouter)
app.use('/invite',    inviteRouter)
app.use('/inbox',     inboxRouter)
app.use('/leads',     leadsRouter)
app.use('/bookings',  bookingsRouter)
app.use('/voice',     voiceRouter)
app.use('/tickets',   ticketsRouter)
app.use('/invoices',  invoicesRouter)
app.use('/inventory', inventoryRouter)
app.use('/projects',  projectsRouter)
app.use('/hr',        hrRouter)
app.use('/analytics',    analyticsRouter)
app.use('/forms',        formsRouter)
app.use('/campaigns',    campaignsRouter)
app.use('/surveys',      surveysRouter)
app.use('/landing-pages',landingPagesRouter)
app.use('/public',       publicRouter)

// Catch-all error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ error: 'Internal server error' })
  } else {
    res.status(500).json({ error: err.message, stack: err.stack })
  }
})

const PORT = Number(process.env.PORT ?? 4000)
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`)
  startWorkflowWorker()
})
