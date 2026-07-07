import { Router } from 'express'
import { z }       from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { requireRole }  from '../middleware/requireRole.js'
import rateLimit        from 'express-rate-limit'

const router = Router()
router.use(authenticate)

// Lead gen is expensive (external API calls) — tighter rate limit
const leadSearchLimit = rateLimit({ windowMs: 60_000, max: 10, message: { error: 'Too many lead searches. Wait 1 minute.' } })

// ── Lead sources (search history) ────────────────────────────────────────────

router.get('/sources', async (req, res, next) => {
  try {
    const sources = await req.db.leadSource.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { _count: { select: { leads: true } } },
    })
    res.json(sources)
  } catch (err) { next(err) }
})

// ── NL query → staged leads (review before import) ───────────────────────────

const SearchSchema = z.object({
  query:    z.string().min(3).max(200),
  provider: z.enum(['GOOGLE_PLACES', 'APOLLO', 'META_ADS']).default('GOOGLE_PLACES'),
  location: z.string().optional(),
  limit:    z.number().int().min(1).max(20).default(10),
})

router.post('/search', leadSearchLimit, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = SearchSchema.parse(req.body)

    // Create lead source record
    const source = await req.db.leadSource.create({
      data: {
        tenantId: req.tenantId,
        query:    body.query,
        provider: body.provider,
      },
    })

    // Fetch from provider
    let rawLeads: RawLead[] = []
    try {
      rawLeads = await fetchFromProvider(body)
    } catch (err) {
      // Delete the source if provider fails
      await req.db.leadSource.delete({ where: { id: source.id } })
      throw err
    }

    // Stage leads for review — no auto-import
    const leads = await req.db.lead.createMany({
      data: rawLeads.map(l => ({
        tenantId:     req.tenantId,
        leadSourceId: source.id,
        name:         l.name,
        email:        l.email,
        phone:        l.phone,
        company:      l.company,
        website:      l.website,
        address:      l.address,
        industry:     l.industry,
        employeeCount: l.employeeCount,
        rawData:      l.rawData,
      })),
    })

    res.status(201).json({ sourceId: source.id, staged: leads.count })
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Staged leads for a source ─────────────────────────────────────────────────

router.get('/sources/:sourceId/leads', async (req, res, next) => {
  try {
    const leads = await req.db.lead.findMany({
      where:   { leadSourceId: req.params.sourceId },
      orderBy: { createdAt: 'asc' },
    })
    res.json(leads)
  } catch (err) { next(err) }
})

// ── All pending leads (across sources) ───────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const status = (req.query.status as string) ?? 'PENDING'
    const leads  = await req.db.lead.findMany({
      where:   { status: status as 'PENDING' | 'IMPORTED' | 'REJECTED' },
      orderBy: { createdAt: 'desc' },
      take:    100,
      include: { leadSource: { select: { query: true, provider: true } } },
    })
    res.json(leads)
  } catch (err) { next(err) }
})

// ── Import a lead → Contact ──────────────────────────────────────────────────

router.post('/:id/import', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const lead = await req.db.lead.findFirst({ where: { id: req.params.id } })
    if (!lead) { res.status(404).json({ error: 'Lead not found' }); return }
    if (lead.status !== 'PENDING') { res.status(409).json({ error: `Lead already ${lead.status.toLowerCase()}` }); return }

    const contact = await req.db.$transaction(async tx => {
      const c = await tx.contact.create({
        data: {
          tenantId: req.tenantId,
          name:     lead.name,
          email:    lead.email ?? undefined,
          phone:    lead.phone ?? undefined,
          company:  lead.company ?? undefined,
          notes:    [lead.address, lead.industry, lead.website].filter(Boolean).join('\n') || undefined,
        },
      })
      await tx.lead.update({
        where: { id: lead.id },
        data:  { status: 'IMPORTED', contactId: c.id },
      })
      return c
    })

    res.status(201).json({ contact })
  } catch (err) { next(err) }
})

// ── Bulk import ───────────────────────────────────────────────────────────────

router.post('/import-bulk', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { leadIds } = z.object({ leadIds: z.array(z.string()).min(1).max(50) }).parse(req.body)

    const results = await Promise.allSettled(
      leadIds.map(async id => {
        const lead = await req.db.lead.findFirst({ where: { id, status: 'PENDING' } })
        if (!lead) return { id, ok: false, reason: 'Not found or not pending' }

        const contact = await req.db.$transaction(async tx => {
          const c = await tx.contact.create({
            data: {
              tenantId: req.tenantId,
              name:     lead.name,
              email:    lead.email ?? undefined,
              phone:    lead.phone ?? undefined,
              company:  lead.company ?? undefined,
            },
          })
          await tx.lead.update({ where: { id }, data: { status: 'IMPORTED', contactId: c.id } })
          return c
        })
        return { id, ok: true, contactId: contact.id }
      })
    )

    const imported = results.filter(r => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok).length
    res.json({ imported, total: leadIds.length })
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Reject a lead ─────────────────────────────────────────────────────────────

router.post('/:id/reject', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const lead = await req.db.lead.update({
      where: { id: req.params.id },
      data:  { status: 'REJECTED' },
    })
    res.json(lead)
  } catch (err) { next(err) }
})

// ── Lead Order Form — saves structured client order ───────────────────────────

const OrderSchema = z.object({
  clientName:    z.string().min(1).max(120),
  clientEmail:   z.string().email().optional(),
  leadType:      z.string().min(1),
  industries:    z.array(z.string()).min(1),
  customIndustry: z.string().optional(),
  jobTitles:     z.array(z.string()).default([]),
  customJobTitle: z.string().optional(),
  location:      z.string().min(1),
  companySizes:  z.array(z.string()).default([]),
  dataFields:    z.array(z.string()).min(1),
  quantity:      z.number().int().min(1).max(100_000),
  instructions:  z.string().max(2000).optional(),
})

router.post('/order', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = OrderSchema.parse(req.body)

    const source = await req.db.leadSource.create({
      data: {
        tenantId: req.tenantId,
        provider: 'ORDER_FORM',
        query: JSON.stringify({
          type:       body.leadType,
          industries: [...body.industries, ...(body.customIndustry ? [body.customIndustry] : [])],
          jobTitles:  [...body.jobTitles,  ...(body.customJobTitle  ? [body.customJobTitle]  : [])],
          location:   body.location,
          companySize: body.companySizes,
          dataFields: body.dataFields,
          quantity:   body.quantity,
          client:     { name: body.clientName, email: body.clientEmail },
          note:       body.instructions,
        }),
      },
    })

    res.status(201).json({ orderId: source.id, quantity: body.quantity, clientName: body.clientName })
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Full website analysis — returns everything without staging to DB ───────────

router.post('/analyze', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { url } = z.object({ url: z.string().url('Must be a valid URL (include https://)') }).parse(req.body)

    const scraperUrl = process.env.SCRAPER_URL ?? 'http://localhost:8001'
    const fetch      = (await import('node-fetch')).default

    let scraperRes: Awaited<ReturnType<typeof fetch>>
    try {
      scraperRes = await fetch(`${scraperUrl}/analyze`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url }),
        signal:  AbortSignal.timeout(60_000),
      })
    } catch {
      res.status(503).json({
        error: 'Web scraper service is offline. Run: apps/scraper/start.bat',
        hint:  'Start the Python scraper service first, then retry.',
      })
      return
    }

    if (!scraperRes.ok) {
      const err = await scraperRes.json() as { detail?: string }
      res.status(502).json({ error: err.detail ?? 'Scraper returned an error' })
      return
    }

    const result = await scraperRes.json()
    res.json(result)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Web scraper endpoint — calls Python microservice on port 8001 ─────────────

router.post('/scrape', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = z.object({
      url:      z.string().url('Must be a valid URL (include https://)'),
      mode:     z.enum(['auto', 'static', 'dynamic', 'selenium', 'spider']).default('auto'),
      depth:    z.number().int().min(1).max(3).default(1),
      maxPages: z.number().int().min(1).max(20).default(10),
      maxLeads: z.number().int().min(1).max(100).default(50),
    }).parse(req.body)

    const scraperUrl = process.env.SCRAPER_URL ?? 'http://localhost:8001'
    const fetch      = (await import('node-fetch')).default

    let scraperRes: Awaited<ReturnType<typeof fetch>>
    try {
      scraperRes = await fetch(`${scraperUrl}/scrape`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          url:       body.url,
          mode:      body.mode,
          depth:     body.depth,
          max_pages: body.maxPages,
          max_leads: body.maxLeads,
        }),
        signal: AbortSignal.timeout(120_000),
      })
    } catch {
      res.status(503).json({
        error: 'Web scraper service is offline. Run: apps/scraper/start.bat',
        hint:  'Start the Python scraper service first, then retry.',
      })
      return
    }

    if (!scraperRes.ok) {
      const err = await scraperRes.json() as { detail?: string }
      res.status(502).json({ error: err.detail ?? 'Scraper returned an error' })
      return
    }

    const scraped = await scraperRes.json() as {
      leads:         RawLead[]
      pages_scraped: number
      mode_used:     string
      duration_ms:   number
      total_found:   number
    }

    if (!scraped.leads.length) {
      res.json({ staged: 0, pagesScraped: scraped.pages_scraped, modeUsed: scraped.mode_used, durationMs: scraped.duration_ms })
      return
    }

    // Create lead source
    const source = await req.db.leadSource.create({
      data: { tenantId: req.tenantId, query: body.url, provider: 'WEB_SCRAPER' },
    })

    // Stage leads for review
    const { count } = await req.db.lead.createMany({
      data: scraped.leads.map(l => ({
        tenantId:     req.tenantId,
        leadSourceId: source.id,
        name:         l.name || l.company || new URL(body.url).hostname,
        email:        l.email,
        phone:        l.phone,
        company:      l.company,
        website:      l.website,
        address:      l.address,
        industry:     l.industry,
        rawData:      { ...l, _scraper: true, _mode: scraped.mode_used },
      })),
    })

    res.status(201).json({
      staged:       count,
      pagesScraped: scraped.pages_scraped,
      modeUsed:     scraped.mode_used,
      durationMs:   scraped.duration_ms,
      totalFound:   scraped.total_found,
    })
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Provider adapters ─────────────────────────────────────────────────────────

interface RawLead {
  name: string; email?: string; phone?: string; company?: string
  website?: string; address?: string; industry?: string; employeeCount?: number
  rawData: object
}

async function fetchFromProvider(params: { query: string; provider: string; location?: string; limit: number }): Promise<RawLead[]> {
  switch (params.provider) {
    case 'GOOGLE_PLACES': return fetchGooglePlaces(params.query, params.location, params.limit)
    case 'APOLLO':        return fetchApollo(params.query, params.location, params.limit)
    case 'META_ADS':      return fetchMetaAds(params.query, params.limit)
    default: return []
  }
}

async function fetchGooglePlaces(query: string, location: string | undefined, limit: number): Promise<RawLead[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) return generateMockLeads(query, location, limit, 'google_places')

  const q = [query, location].filter(Boolean).join(' ')
  const fetch = (await import('node-fetch')).default
  const url   = `https://maps.googleapis.com/maps/api/textsearch/json?query=${encodeURIComponent(q)}&key=${key}`
  const res   = await fetch(url)
  const data  = await res.json() as { results?: GooglePlace[] }

  return (data.results ?? []).slice(0, limit).map(p => ({
    name:    p.name,
    address: p.formatted_address,
    phone:   p.formatted_phone_number,
    website: p.website,
    rawData: p,
  }))
}

interface GooglePlace {
  name: string; formatted_address?: string; formatted_phone_number?: string; website?: string
}

async function fetchApollo(query: string, location: string | undefined, limit: number): Promise<RawLead[]> {
  const key = process.env.APOLLO_API_KEY
  if (!key) return generateMockLeads(query, location, limit, 'apollo')

  const fetch = (await import('node-fetch')).default
  const res   = await fetch('https://api.apollo.io/v1/mixed_people/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': key },
    body: JSON.stringify({
      q_keywords:        query,
      person_locations:  location ? [location] : undefined,
      per_page:          limit,
    }),
  })
  const data = await res.json() as { people?: ApolloPerson[] }

  return (data.people ?? []).map(p => ({
    name:         [p.first_name, p.last_name].filter(Boolean).join(' '),
    email:        p.email,
    company:      p.organization?.name,
    industry:     p.organization?.industry,
    employeeCount: p.organization?.estimated_num_employees,
    website:      p.organization?.website_url,
    address:      p.city ? [p.city, p.state, p.country].filter(Boolean).join(', ') : undefined,
    rawData:      p,
  }))
}

interface ApolloPerson {
  first_name?: string; last_name?: string; email?: string
  city?: string; state?: string; country?: string
  organization?: { name?: string; industry?: string; estimated_num_employees?: number; website_url?: string }
}

async function fetchMetaAds(query: string, limit: number): Promise<RawLead[]> {
  const token = process.env.META_ACCESS_TOKEN
  if (!token) return generateMockLeads(query, undefined, limit, 'meta_ads')

  const fetch = (await import('node-fetch')).default
  const url   = `https://graph.facebook.com/v19.0/ads_archive?search_terms=${encodeURIComponent(query)}&ad_reached_countries=["US"]&fields=page_name,page_id,ad_snapshot_url&limit=${limit}&access_token=${token}`
  const res   = await fetch(url)
  const data  = await res.json() as { data?: MetaAd[] }

  return (data.data ?? []).map(ad => ({
    name:    ad.page_name,
    company: ad.page_name,
    rawData: ad,
  }))
}

interface MetaAd { page_name: string; page_id?: string; ad_snapshot_url?: string }

// ── Demo / mock data generator (used when API keys are not configured) ────────
// Returns realistic-looking leads based on the search query so the full
// search → review → import flow can be tested without paid API keys.

function generateMockLeads(query: string, location: string | undefined, limit: number, source: string): RawLead[] {
  const loc   = location || 'New York'
  const q     = query.charAt(0).toUpperCase() + query.slice(1)
  const tld   = ['com', 'co', 'io', 'net', 'org']
  const industries = ['Technology', 'Retail', 'Healthcare', 'Finance', 'Logistics', 'Consulting', 'Real Estate', 'Education']
  const streets    = ['Main St', 'Park Ave', 'Broadway', 'Oak Ln', 'Market St', 'Lake Rd', 'Industrial Blvd']

  const names = [
    `${q} Solutions Ltd`, `${q} Group ${loc}`, `Premier ${q} Co`, `${loc} ${q} Hub`,
    `${q} Pro Services`, `Global ${q} Inc`, `${q} Experts LLC`, `The ${q} Company`,
    `${q} Partners`, `Fast ${q} Agency`, `Elite ${q}`, `Next ${q} Corp`,
    `${q} Network`, `Smart ${q} Group`, `Alpha ${q}`,
  ]

  const seed = (str: string) => str.split('').reduce((a, c) => a + c.charCodeAt(0), 0)

  return Array.from({ length: Math.min(limit, names.length) }, (_, i) => {
    const name    = names[i] ?? `${q} Business ${i + 1}`
    const slug    = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)
    const s       = (seed(name + i) % 100)
    const phone   = `+1 (${200 + (s % 800 - s % 100)}) ${100 + (s % 900 - s % 100)}-${1000 + (seed(name) % 9000)}`
    const ind     = industries[(seed(name) % industries.length)]
    const street  = streets[(seed(name + 'st') % streets.length)]
    const empCount = [5, 12, 25, 50, 120, 250, 500][(seed(name) % 7)]

    return {
      name,
      company:      name,
      email:        `hello@${slug}.${tld[seed(name) % tld.length]}`,
      phone,
      website:      `https://www.${slug}.${tld[seed(name) % tld.length]}`,
      address:      `${100 + (seed(name) % 900)} ${street}, ${loc}`,
      industry:     ind,
      employeeCount: empCount,
      rawData:      { _demo: true, source, query, location: loc },
    }
  })
}

export default router
