import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'

const router = Router()
router.use(authenticate)

// ── Dashboard summary KPIs ────────────────────────────────────────────────────
router.get('/summary', async (req, res, next) => {
  try {
    const db  = req.db
    const tid = req.tenantId

    const [
      contacts, deals, openTickets, revenue,
      pendingLeads, activeProjects, lowStock, leaveRequests,
      recentContacts, recentDeals,
    ] = await Promise.all([
      db.contact.count({ where: { tenantId: tid } }),
      db.deal.findMany({
        where: { tenantId: tid },
        select: { value: true, stage: { select: { name: true } } },
      }),
      db.ticket.count({ where: { tenantId: tid, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      db.payment.aggregate({ where: { tenantId: tid }, _sum: { amount: true } }),
      db.lead.count({ where: { tenantId: tid, status: 'PENDING' } }),
      db.project.count({ where: { tenantId: tid, status: { in: ['PLANNING', 'ACTIVE'] } } }),
      db.product.count({ where: { tenantId: tid, currentStock: { lte: 5 } } }),
      db.leaveRequest.count({ where: { tenantId: tid, status: 'PENDING' } }),
      db.contact.findMany({
        where: { tenantId: tid }, orderBy: { createdAt: 'desc' }, take: 5,
        select: { id: true, name: true, company: true, createdAt: true },
      }),
      db.deal.findMany({
        where: { tenantId: tid }, orderBy: { updatedAt: 'desc' }, take: 5,
        select: { id: true, title: true, value: true, updatedAt: true, stage: { select: { name: true } } },
      }),
    ])

    const totalDealValue = deals.reduce((s, d) => s + (Number(d.value) || 0), 0)
    const wonDeals       = deals.filter(d => d.stage.name === 'WON' || d.stage.name === 'Won').length
    const pipeline       = deals.reduce((acc, d) => {
      const key = d.stage.name
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    res.json({
      kpis: {
        contacts,
        totalDealValue,
        wonDeals,
        openDeals:     deals.filter(d => !['WON','LOST','Won','Lost'].includes(d.stage.name)).length,
        openTickets,
        revenue:       Number(revenue._sum?.amount) || 0,
        pendingLeads,
        activeProjects,
        lowStockItems: lowStock,
        leaveRequests,
      },
      pipeline,
      recentContacts,
      recentDeals: recentDeals.map(d => ({ ...d, stage: d.stage.name })),
    })
  } catch (err) { next(err) }
})

// ── Monthly revenue (last 6 months from payments) ─────────────────────────────
router.get('/revenue', async (req, res, next) => {
  try {
    const tid    = req.tenantId
    const months: { month: string; revenue: number; invoices: number }[] = []

    for (let i = 5; i >= 0; i--) {
      const d     = new Date()
      d.setMonth(d.getMonth() - i)
      const start = new Date(d.getFullYear(), d.getMonth(), 1)
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)

      const [agg, invCount] = await Promise.all([
        req.db.payment.aggregate({
          where: { tenantId: tid, paidAt: { gte: start, lte: end } },
          _sum: { amount: true },
        }),
        req.db.invoice.count({
          where: { tenantId: tid, issuedAt: { gte: start, lte: end } },
        }),
      ])
      months.push({
        month:    start.toLocaleString('en-US', { month: 'short' }),
        revenue:  Number(agg._sum?.amount) || 0,
        invoices: invCount,
      })
    }
    res.json(months)
  } catch (err) { next(err) }
})

// ── Pipeline funnel (by stage name) ──────────────────────────────────────────
router.get('/pipeline', async (req, res, next) => {
  try {
    const tid   = req.tenantId
    const deals = await req.db.deal.findMany({
      where:  { tenantId: tid },
      select: { value: true, stage: { select: { name: true, position: true } } },
    })

    // Group by stage name
    const map = new Map<string, { count: number; value: number; position: number }>()
    for (const d of deals) {
      const n = d.stage.name
      const p = d.stage.position
      if (!map.has(n)) map.set(n, { count: 0, value: 0, position: p })
      const row = map.get(n)!
      row.count++
      row.value += Number(d.value) || 0
    }

    const rows = Array.from(map.entries())
      .map(([stage, v]) => ({ stage, ...v }))
      .sort((a, b) => a.position - b.position)

    res.json(rows)
  } catch (err) { next(err) }
})

// ── Ticket status breakdown ────────────────────────────────────────────────────
router.get('/tickets', async (req, res, next) => {
  try {
    const tid      = req.tenantId
    const statuses = ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED']
    const rows = await Promise.all(
      statuses.map(async status => ({
        status,
        count: await req.db.ticket.count({ where: { tenantId: tid, status: status as never } }),
      }))
    )
    res.json(rows)
  } catch (err) { next(err) }
})

export default router
