/**
 * Public routes — no authentication required.
 * Used by public form/survey/landing page pages embedded on customer websites.
 */
import { Router } from 'express'
import { z } from 'zod'

const router = Router()

// ── FORMS ─────────────────────────────────────────────────────────────────────

// Get form config by slug (for rendering the public form)
router.get('/forms/:slug', async (req, res, next) => {
  try {
    const form = await req.db.form.findFirst({
      where:  { slug: req.params.slug, isActive: true },
      select: { id: true, title: true, description: true, fields: true, slug: true },
    })
    if (!form) return res.status(404).json({ error: 'Form not found or inactive' })
    res.json(form)
  } catch (err) { next(err) }
})

// Submit a form
router.post('/forms/:slug/submit', async (req, res, next) => {
  try {
    const form = await req.db.form.findFirst({
      where: { slug: req.params.slug, isActive: true },
    })
    if (!form) return res.status(404).json({ error: 'Form not found or inactive' })

    const data = req.body?.data
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Missing submission data' })

    // Auto-create or find contact
    let contactId: string | undefined
    if (form.createContact) {
      const fields = form.fields as { id: string; type: string; label: string }[]
      const emailField = fields.find(f => f.type === 'email')
      const nameField  = fields.find(f => f.label.toLowerCase().includes('name'))
      const phoneField = fields.find(f => f.type === 'tel')

      const email   = emailField ? String(data[emailField.id] ?? '') : ''
      const name    = nameField  ? String(data[nameField.id] ?? '') : email.split('@')[0] || 'Unknown'
      const phone   = phoneField ? String(data[phoneField.id] ?? '') : undefined

      if (email || name !== 'Unknown') {
        // Upsert contact by email
        const existing = email ? await req.db.contact.findFirst({
          where: { tenantId: form.tenantId, email },
        }) : null

        if (existing) {
          contactId = existing.id
        } else {
          const contact = await req.db.contact.create({
            data: { tenantId: form.tenantId, name, email: email || undefined, phone },
          })
          contactId = contact.id
        }
      }
    }

    const submission = await req.db.formSubmission.create({
      data: {
        formId:    form.id,
        tenantId:  form.tenantId,
        data,
        contactId,
        ipAddress: req.ip,
      },
    })

    res.status(201).json({ ok: true, id: submission.id })
  } catch (err) { next(err) }
})

// ── SURVEYS ───────────────────────────────────────────────────────────────────

// Get survey config by slug
router.get('/surveys/:slug', async (req, res, next) => {
  try {
    const survey = await req.db.survey.findFirst({
      where:  { slug: req.params.slug, isActive: true },
      select: { id: true, title: true, description: true, questions: true, thankYouMsg: true, slug: true },
    })
    if (!survey) return res.status(404).json({ error: 'Survey not found or inactive' })
    res.json(survey)
  } catch (err) { next(err) }
})

// Submit survey response
router.post('/surveys/:slug/respond', async (req, res, next) => {
  try {
    const survey = await req.db.survey.findFirst({
      where: { slug: req.params.slug, isActive: true },
    })
    if (!survey) return res.status(404).json({ error: 'Survey not found or inactive' })

    const answers = req.body?.answers
    if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'Missing answers' })

    // Optional: link to contact by email if provided
    const email = req.body?.email ? String(req.body.email) : undefined
    let contactId: string | undefined
    if (email) {
      const c = await req.db.contact.findFirst({ where: { tenantId: survey.tenantId, email } })
      if (c) contactId = c.id
    }

    await req.db.surveyResponse.create({
      data: { surveyId: survey.id, tenantId: survey.tenantId, answers, contactId },
    })

    res.status(201).json({ ok: true, thankYouMsg: survey.thankYouMsg })
  } catch (err) { next(err) }
})

// ── LANDING PAGES ─────────────────────────────────────────────────────────────

// Get published landing page
router.get('/pages/:slug', async (req, res, next) => {
  try {
    const page = await req.db.landingPage.findFirst({
      where:  { slug: req.params.slug, published: true },
      select: {
        id: true, title: true, headline: true, subheadline: true,
        heroImageUrl: true, brandColor: true, ctaText: true,
        ctaAction: true, ctaTarget: true, formFields: true,
      },
    })
    if (!page) return res.status(404).json({ error: 'Page not found' })
    // Increment view count (fire-and-forget)
    req.db.landingPage.update({ where: { slug: req.params.slug }, data: { views: { increment: 1 } } }).catch(() => {})
    res.json(page)
  } catch (err) { next(err) }
})

// Submit landing page form lead
router.post('/pages/:slug/lead', async (req, res, next) => {
  try {
    const page = await req.db.landingPage.findFirst({
      where: { slug: req.params.slug, published: true },
    })
    if (!page) return res.status(404).json({ error: 'Page not found' })

    const { name, email, phone, ...extra } = req.body ?? {}
    if (!name && !email) return res.status(400).json({ error: 'Name or email required' })

    const existing = email ? await req.db.contact.findFirst({
      where: { tenantId: page.tenantId, email: String(email) },
    }) : null

    if (!existing) {
      await req.db.contact.create({
        data: {
          tenantId: page.tenantId,
          name:  String(name ?? email),
          email: email ? String(email) : undefined,
          phone: phone ? String(phone) : undefined,
          notes: Object.keys(extra).length ? JSON.stringify(extra) : undefined,
        },
      })
    }

    await req.db.landingPage.update({
      where: { slug: req.params.slug },
      data:  { leads: { increment: 1 } },
    })

    res.status(201).json({ ok: true })
  } catch (err) { next(err) }
})

export default router
