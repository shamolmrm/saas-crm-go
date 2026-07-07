import { Router } from 'express'
import { z }       from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { requireRole }  from '../middleware/requireRole.js'

const router = Router()
router.use(authenticate)

const ItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity:    z.number().positive(),
  unitPrice:   z.number().nonnegative(),
})

const InvoiceSchema = z.object({
  contactId: z.string().optional(),
  dealId:    z.string().optional(),
  currency:  z.string().default('USD'),
  taxRate:   z.number().min(0).max(1).optional(),
  notes:     z.string().optional(),
  dueDate:   z.string().datetime().optional(),
  items:     z.array(ItemSchema).min(1),
})

// ── List ──────────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined
    const page   = Math.max(1, Number(req.query.page ?? 1))
    const limit  = 25

    const [invoices, total] = await Promise.all([
      req.db.invoice.findMany({
        where:   status ? { status: status as 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'VOID' } : {},
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
        include: {
          contact: { select: { id: true, name: true } },
          items:   true,
          _count:  { select: { payments: true } },
        },
      }),
      req.db.invoice.count({ where: status ? { status: status as 'DRAFT' } : {} }),
    ])
    res.json({ invoices, total, page, pages: Math.ceil(total / limit) })
  } catch (err) { next(err) }
})

// ── Create (DRAFT) ────────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
  try {
    const body    = InvoiceSchema.parse(req.body)
    const { items, ...invoiceData } = body

    const invoice = await req.db.$transaction(async tx => {
      const inv = await tx.invoice.create({
        data: {
          ...invoiceData,
          tenantId: req.tenantId,
          dueDate:  invoiceData.dueDate ? new Date(invoiceData.dueDate) : undefined,
          items:    { create: items.map(i => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })) },
        },
        include: { items: true, contact: { select: { id: true, name: true } } },
      })
      await tx.invoiceAuditEvent.create({ data: { invoiceId: inv.id, event: 'CREATED', actorId: req.userId } })
      return inv
    })

    res.status(201).json(invoice)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Get ───────────────────────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const inv = await req.db.invoice.findFirst({
      where:   { id: req.params.id },
      include: {
        contact:     { select: { id: true, name: true, email: true } },
        deal:        { select: { id: true, title: true } },
        items:       true,
        payments:    true,
        auditEvents: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!inv) { res.status(404).json({ error: 'Invoice not found' }); return }
    res.json(inv)
  } catch (err) { next(err) }
})

// ── Update (DRAFT only) ───────────────────────────────────────────────────────

router.patch('/:id', async (req, res, next) => {
  try {
    const inv = await req.db.invoice.findFirst({ where: { id: req.params.id }, select: { status: true } })
    if (!inv) { res.status(404).json({ error: 'Invoice not found' }); return }
    if (inv.status !== 'DRAFT') { res.status(409).json({ error: `Invoice is ${inv.status} and cannot be edited` }); return }

    const body = InvoiceSchema.partial().parse(req.body)
    const { items, ...invoiceData } = body

    const updated = await req.db.$transaction(async tx => {
      if (items) {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: req.params.id } })
        await tx.invoiceItem.createMany({ data: items.map(i => ({ ...i, invoiceId: req.params.id })) })
      }
      return tx.invoice.update({
        where: { id: req.params.id },
        data:  { ...invoiceData, dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : undefined },
        include: { items: true },
      })
    })
    res.json(updated)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Send: assigns number via FOR UPDATE counter ────────────────────────────────

router.post('/:id/send', async (req, res, next) => {
  try {
    const inv = await req.db.invoice.findFirst({ where: { id: req.params.id }, select: { status: true } })
    if (!inv) { res.status(404).json({ error: 'Invoice not found' }); return }
    if (inv.status !== 'DRAFT') { res.status(409).json({ error: 'Only DRAFT invoices can be sent' }); return }

    const updated = await req.db.$transaction(async tx => {
      // Upsert counter and increment atomically
      const counter = await tx.$executeRaw`
        INSERT INTO "InvoiceCounter" ("tenantId", "lastNumber")
        VALUES (${req.tenantId}, 1)
        ON CONFLICT ("tenantId") DO UPDATE
        SET "lastNumber" = "InvoiceCounter"."lastNumber" + 1
      `
      const row = await tx.$queryRaw<{ lastNumber: number }[]>`
        SELECT "lastNumber" FROM "InvoiceCounter" WHERE "tenantId" = ${req.tenantId}
      `
      const num = row[0]?.lastNumber ?? 1
      const number = `INV-${String(num).padStart(4, '0')}`

      const updated = await tx.invoice.update({
        where: { id: req.params.id },
        data:  { status: 'SENT', number, issuedAt: new Date() },
      })
      await tx.invoiceAuditEvent.create({ data: { invoiceId: req.params.id, event: 'SENT', actorId: req.userId, metadata: { number } } })
      return updated
    })
    res.json(updated)
  } catch (err) { next(err) }
})

// ── Void (ADMIN only) ─────────────────────────────────────────────────────────

router.post('/:id/void', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = z.object({ reason: z.string().min(1).max(500) }).parse(req.body)
    const inv  = await req.db.invoice.findFirst({ where: { id: req.params.id }, select: { status: true } })
    if (!inv) { res.status(404).json({ error: 'Invoice not found' }); return }
    if (inv.status === 'VOID') { res.status(409).json({ error: 'Invoice already voided' }); return }
    if (inv.status === 'PAID') { res.status(409).json({ error: 'Cannot void a paid invoice' }); return }

    const updated = await req.db.$transaction(async tx => {
      const u = await tx.invoice.update({ where: { id: req.params.id }, data: { status: 'VOID', voidReason: body.reason } })
      await tx.invoiceAuditEvent.create({ data: { invoiceId: req.params.id, event: 'VOIDED', actorId: req.userId, metadata: { reason: body.reason } } })
      return u
    })
    res.json(updated)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Record payment (idempotency key prevents double-charge) ──────────────────

router.post('/:id/payments', async (req, res, next) => {
  try {
    const body = z.object({
      amount:         z.number().positive(),
      method:         z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'MOBILE', 'CHEQUE', 'OTHER']).default('BANK_TRANSFER'),
      notes:          z.string().optional(),
      idempotencyKey: z.string().optional(),
      paidAt:         z.string().datetime().optional(),
    }).parse(req.body)

    const inv = await req.db.invoice.findFirst({ where: { id: req.params.id }, select: { status: true, currency: true } })
    if (!inv) { res.status(404).json({ error: 'Invoice not found' }); return }
    if (inv.status === 'VOID') { res.status(409).json({ error: 'Cannot record payment on a voided invoice' }); return }

    const payment = await req.db.$transaction(async tx => {
      const p = await tx.payment.create({
        data: {
          invoiceId:      req.params.id,
          tenantId:       req.tenantId,
          amount:         body.amount,
          currency:       inv.currency,
          method:         body.method,
          notes:          body.notes,
          idempotencyKey: body.idempotencyKey,
          paidAt:         body.paidAt ? new Date(body.paidAt) : new Date(),
        },
      })
      await tx.invoice.update({ where: { id: req.params.id }, data: { status: 'PAID', paidAt: p.paidAt } })
      await tx.invoiceAuditEvent.create({ data: { invoiceId: req.params.id, event: 'PAYMENT_RECORDED', actorId: req.userId, metadata: { amount: body.amount } } })
      return p
    })
    res.status(201).json(payment)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    // Unique constraint on idempotencyKey → duplicate payment
    if ((err as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'Duplicate payment (idempotency key already used)' }); return }
    next(err)
  }
})

// ── Expenses ──────────────────────────────────────────────────────────────────

router.get('/expenses', async (req, res, next) => {
  try {
    const expenses = await req.db.expense.findMany({ orderBy: { date: 'desc' }, take: 100 })
    res.json(expenses)
  } catch (err) { next(err) }
})

router.post('/expenses', async (req, res, next) => {
  try {
    const body = z.object({
      description: z.string().min(1).max(300),
      amount:      z.number().positive(),
      currency:    z.string().default('USD'),
      category:    z.enum(['SALARY', 'RENT', 'UTILITIES', 'MARKETING', 'TRAVEL', 'SUPPLIES', 'OTHER']).default('OTHER'),
      date:        z.string().datetime(),
      notes:       z.string().optional(),
    }).parse(req.body)

    const expense = await req.db.expense.create({
      data: { ...body, date: new Date(body.date), tenantId: req.tenantId, createdById: req.userId },
    })
    res.status(201).json(expense)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── P&L report ───────────────────────────────────────────────────────────────

router.get('/reports/pl', async (req, res, next) => {
  try {
    const from = req.query.from ? new Date(req.query.from as string) : new Date(new Date().getFullYear(), 0, 1)
    const to   = req.query.to   ? new Date(req.query.to   as string) : new Date()

    const [payments, expenses, invoiceCount] = await Promise.all([
      req.db.payment.findMany({
        where: { tenantId: req.tenantId, paidAt: { gte: from, lte: to } },
        select: { amount: true, currency: true },
      }),
      req.db.expense.findMany({
        where: { tenantId: req.tenantId, date: { gte: from, lte: to } },
        select: { amount: true, currency: true, category: true },
      }),
      req.db.invoice.count({ where: { tenantId: req.tenantId, status: 'PAID', paidAt: { gte: from, lte: to } } }),
    ])

    const revenue  = payments.reduce((s, p) => s + Number(p.amount), 0)
    const totalExp = expenses.reduce((s, e) => s + Number(e.amount), 0)
    const profit   = revenue - totalExp

    const expByCategory = expenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount)
      return acc
    }, {} as Record<string, number>)

    res.json({ from, to, revenue, totalExpenses: totalExp, profit, invoicesPaid: invoiceCount, expByCategory })
  } catch (err) { next(err) }
})

export default router
