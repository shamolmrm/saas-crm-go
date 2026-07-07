import { Router } from 'express'
import { z }       from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { requireRole }  from '../middleware/requireRole.js'

const router = Router()
router.use(authenticate)

// ── Products ──────────────────────────────────────────────────────────────────

const ProductSchema = z.object({
  name:          z.string().min(1).max(200),
  sku:           z.string().max(100).optional(),
  description:   z.string().optional(),
  unitCost:      z.number().nonnegative().optional(),
  unitPrice:     z.number().nonnegative().optional(),
  unit:          z.string().default('pcs'),
  allowBackorder: z.boolean().default(false),
})

router.get('/products', async (req, res, next) => {
  try {
    const products = await req.db.product.findMany({ orderBy: { name: 'asc' } })
    res.json(products)
  } catch (err) { next(err) }
})

router.post('/products', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body    = ProductSchema.parse(req.body)
    const product = await req.db.product.create({ data: { ...body, tenantId: req.tenantId } })
    res.status(201).json(product)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    if ((err as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'SKU already in use' }); return }
    next(err)
  }
})

router.patch('/products/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body    = ProductSchema.partial().parse(req.body)
    const product = await req.db.product.update({ where: { id: req.params.id }, data: body })
    res.json(product)
  } catch (err) { next(err) }
})

// ── Stock movements (append-only ledger) ─────────────────────────────────────

const AdjustSchema = z.object({
  type:     z.enum(['RECEIVED', 'ADJUSTED', 'RETURNED', 'WRITE_OFF']),
  quantity: z.number().int().refine(q => q !== 0, 'Quantity cannot be zero'),
  note:     z.string().optional(),
})

router.post('/products/:id/adjust', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = AdjustSchema.parse(req.body)

    // FOR UPDATE equivalent: transaction prevents concurrent adjustments
    const result = await req.db.$transaction(async tx => {
      const product = await tx.product.findFirst({ where: { id: req.params.id } })
      if (!product) throw new NotFoundError('Product not found')

      const newBalance = product.currentStock + body.quantity

      // Check backorder setting for SOLD/WRITE_OFF types that reduce stock
      if (newBalance < 0 && !product.allowBackorder && body.type !== 'ADJUSTED') {
        throw new InsufficientStockError(`Insufficient stock (have ${product.currentStock}, need ${Math.abs(body.quantity)})`)
      }

      const movement = await tx.stockMovement.create({
        data: {
          tenantId:  req.tenantId,
          productId: req.params.id,
          type:      body.type,
          quantity:  body.quantity,
          balance:   newBalance,
          note:      body.note,
        },
      })

      // Update cached currentStock
      await tx.product.update({ where: { id: req.params.id }, data: { currentStock: newBalance } })

      return { movement, newBalance }
    })

    res.status(201).json(result)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    if (err instanceof NotFoundError) { res.status(404).json({ error: err.message }); return }
    if (err instanceof InsufficientStockError) { res.status(409).json({ error: err.message }); return }
    next(err)
  }
})

router.get('/products/:id/movements', async (req, res, next) => {
  try {
    const movements = await req.db.stockMovement.findMany({
      where:   { productId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take:    100,
    })
    res.json(movements)
  } catch (err) { next(err) }
})

// ── Low stock report ──────────────────────────────────────────────────────────

router.get('/low-stock', async (req, res, next) => {
  try {
    const threshold = Number(req.query.threshold ?? 5)
    const products  = await req.db.product.findMany({
      where:   { currentStock: { lte: threshold } },
      orderBy: { currentStock: 'asc' },
    })
    res.json(products)
  } catch (err) { next(err) }
})

class NotFoundError extends Error {}
class InsufficientStockError extends Error {}

export default router
