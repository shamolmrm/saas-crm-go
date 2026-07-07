import OpenAI    from 'openai'
import { z }      from 'zod'
import type { ScopedPrismaClient } from '@crm/db'

// OpenAI client is instantiated here — API key stays backend-only.
// Never import or reference OPENAI_API_KEY from any frontend code.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const MODEL  = process.env.OPENAI_MODEL ?? 'gpt-4o'

// ── Contact Summary ───────────────────────────────────────────────────────────

export async function generateContactSummary(
  db: ScopedPrismaClient,
  contactId: string,
): Promise<string> {
  const contact = await db.contact.findFirst({
    where: { id: contactId },
    include: {
      deals:      { include: { stage: true }, take: 10, orderBy: { createdAt: 'desc' } },
      activities: { take: 20, orderBy: { occurredAt: 'desc' } },
    },
  })
  if (!contact) throw new Error('Contact not found')

  const context = [
    `Name: ${contact.name}`,
    contact.company  ? `Company: ${contact.company}`    : null,
    contact.jobTitle ? `Title: ${contact.jobTitle}`     : null,
    contact.email    ? `Email: ${contact.email}`        : null,
    contact.phone    ? `Phone: ${contact.phone}`        : null,
    contact.notes    ? `Notes: ${contact.notes}`        : null,
    contact.deals.length > 0
      ? `Deals: ${contact.deals.map((d: { title: string; stage: { name: string }; currency: string; value: unknown }) => `${d.title} (${d.stage.name}, ${d.currency} ${d.value ?? 'N/A'})`).join('; ')}`
      : null,
    contact.activities.length > 0
      ? `Recent activity: ${contact.activities.slice(0, 5).map(a => `[${a.type}] ${a.subject ?? a.body?.slice(0, 80) ?? ''}`).join('; ')}`
      : null,
  ].filter(Boolean).join('\n')

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are a CRM assistant. Write a concise 2-3 sentence summary of this contact for a sales rep. Focus on their business context, current deals, and any notable recent activity. Be factual — only use the provided information.',
      },
      { role: 'user', content: context },
    ],
    max_tokens: 200,
    temperature: 0.3,
  })

  return completion.choices[0].message.content?.trim() ?? 'No summary available.'
}

// ── AI Copilot Search — constrained function-calling ─────────────────────────
// The LLM is forced to call ONLY the named function. It cannot generate arbitrary
// queries or access any data outside the defined function list. All returned IDs
// are re-fetched via scopedPrisma to ensure tenant isolation — the LLM never
// directly returns data, only structured query parameters.

const COPILOT_FUNCTIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'search_crm',
      description: 'Search contacts, deals, and activities in the CRM based on natural language query',
      parameters: {
        type: 'object',
        properties: {
          entityType: {
            type: 'string',
            enum: ['contact', 'deal', 'activity', 'all'],
            description: 'Which entity type to search',
          },
          nameContains: { type: 'string',  description: 'Filter by name containing this text' },
          company:      { type: 'string',  description: 'Filter contacts by company name' },
          dealStage:    { type: 'string',  description: 'Filter deals by stage name' },
          dealStatus:   { type: 'string',  enum: ['OPEN', 'WON', 'LOST'] },
          minValue:     { type: 'number',  description: 'Minimum deal value' },
          maxValue:     { type: 'number',  description: 'Maximum deal value' },
          activityType: { type: 'string',  enum: ['NOTE', 'EMAIL', 'CALL', 'MEETING', 'TASK'] },
          limit:        { type: 'integer', minimum: 1, maximum: 20, default: 10 },
        },
        required: ['entityType'],
        additionalProperties: false,
      },
    },
  },
] as const

const SearchParamsSchema = z.object({
  entityType:   z.enum(['contact', 'deal', 'activity', 'all']),
  nameContains: z.string().optional(),
  company:      z.string().optional(),
  dealStage:    z.string().optional(),
  dealStatus:   z.enum(['OPEN', 'WON', 'LOST']).optional(),
  minValue:     z.number().optional(),
  maxValue:     z.number().optional(),
  activityType: z.enum(['NOTE', 'EMAIL', 'CALL', 'MEETING', 'TASK']).optional(),
  limit:        z.number().int().min(1).max(20).default(10),
})

type SearchParams = z.infer<typeof SearchParamsSchema>

async function executeSearch(db: ScopedPrismaClient, params: SearchParams) {
  const results: { type: string; items: unknown[] }[] = []

  if (params.entityType === 'contact' || params.entityType === 'all') {
    const where: Record<string, unknown> = {}
    if (params.nameContains) {
      where.OR = [
        { name:    { contains: params.nameContains, mode: 'insensitive' } },
        { company: { contains: params.nameContains, mode: 'insensitive' } },
      ]
    }
    if (params.company) where.company = { contains: params.company, mode: 'insensitive' }

    const contacts = await db.contact.findMany({
      where,
      take: params.limit,
      select: { id: true, name: true, email: true, company: true, jobTitle: true },
    })
    results.push({ type: 'contacts', items: contacts })
  }

  if (params.entityType === 'deal' || params.entityType === 'all') {
    const where: Record<string, unknown> = {}
    if (params.nameContains) where.title = { contains: params.nameContains, mode: 'insensitive' }
    if (params.dealStatus)   where.status = params.dealStatus
    if (params.dealStage)    where.stage  = { name: { contains: params.dealStage, mode: 'insensitive' } }
    if (params.minValue !== undefined || params.maxValue !== undefined) {
      where.value = {}
      if (params.minValue !== undefined) (where.value as Record<string, unknown>).gte = params.minValue
      if (params.maxValue !== undefined) (where.value as Record<string, unknown>).lte = params.maxValue
    }

    const deals = await db.deal.findMany({
      where,
      take: params.limit,
      include: {
        stage:   { select: { name: true } },
        contact: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    results.push({ type: 'deals', items: deals })
  }

  if (params.entityType === 'activity' || params.entityType === 'all') {
    const where: Record<string, unknown> = {}
    if (params.activityType) where.type = params.activityType

    const activities = await db.activity.findMany({
      where,
      take: params.limit,
      include: { contact: { select: { name: true } } },
      orderBy: { occurredAt: 'desc' },
    })
    results.push({ type: 'activities', items: activities })
  }

  return results
}

export async function copilotSearch(
  db: ScopedPrismaClient,
  userQuery: string,
): Promise<{ answer: string; results: { type: string; items: unknown[] }[] }> {
  // Step 1: LLM parses the natural language query into structured search params
  // tool_choice forces it to call ONLY search_crm — cannot deviate or generate SQL
  const parseResponse = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are a CRM search assistant. Parse the user\'s natural language query into structured search parameters. Only use the provided function.',
      },
      { role: 'user', content: userQuery },
    ],
    tools:       [...COPILOT_FUNCTIONS],
    tool_choice: { type: 'function', function: { name: 'search_crm' } },
    max_tokens:  300,
  })

  const toolCall = parseResponse.choices[0].message.tool_calls?.[0]
  if (!toolCall) throw new Error('AI did not return search parameters')

  // Step 2: Validate the parsed params — treat LLM output as untrusted input
  let params: SearchParams
  try {
    params = SearchParamsSchema.parse(JSON.parse(toolCall.function.arguments))
  } catch {
    throw new Error('AI returned invalid search parameters')
  }

  // Step 3: Execute the search using scopedPrisma — tenant isolation guaranteed here
  const results = await executeSearch(db, params)

  // Step 4: Generate a natural language answer
  const totalResults = results.reduce((sum, r) => sum + r.items.length, 0)
  const summary = totalResults === 0
    ? 'No results found.'
    : `Found ${totalResults} result(s): ${results.filter(r => r.items.length > 0).map(r => `${r.items.length} ${r.type}`).join(', ')}.`

  return { answer: summary, results }
}
