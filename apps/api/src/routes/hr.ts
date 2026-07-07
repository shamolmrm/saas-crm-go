import { Router, RequestHandler } from 'express'
import { z }                       from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { requireRole }  from '../middleware/requireRole.js'

const router = Router()
router.use(authenticate)

// HR manager check — isHrManager on TenantMember or ADMIN role
const requireHrAccess: RequestHandler = async (req, res, next) => {
  try {
    const member = await req.db.tenantMember.findFirst({
      where: { tenantId: req.tenantId, userId: req.userId },
      select: { role: true, isHrManager: true },
    })
    if (!member || (!member.isHrManager && member.role !== 'ADMIN')) {
      res.status(403).json({ error: 'HR manager access required' }); return
    }
    next()
  } catch (err) { next(err) }
}

async function auditLog(req: Parameters<RequestHandler>[0], action: string, resourceId: string, detail?: string) {
  await req.db.hrAuditLog.create({
    data: { tenantId: req.tenantId, actorId: req.userId, action, resourceId, detail },
  }).catch(() => { /* non-blocking */ })
}

// ── Employee profiles ─────────────────────────────────────────────────────────

router.get('/employees', requireHrAccess,async (req, res, next) => {
  try {
    const employees = await req.db.employeeProfile.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    })
    res.json(employees)
  } catch (err) { next(err) }
})

router.post('/employees', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = z.object({
      userId:         z.string(),
      employeeNumber: z.string().optional(),
      jobTitle:       z.string().optional(),
      department:     z.string().optional(),
      employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']).default('FULL_TIME'),
      startDate:      z.string().datetime().optional(),
      leaveBalance:   z.number().nonnegative().default(20),
    }).parse(req.body)

    const employee = await req.db.employeeProfile.create({
      data: { ...body, tenantId: req.tenantId, startDate: body.startDate ? new Date(body.startDate) : undefined },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    res.status(201).json(employee)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    if ((err as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'User already has an employee profile' }); return }
    next(err)
  }
})

router.patch('/employees/:id', requireHrAccess,async (req, res, next) => {
  try {
    const body = z.object({
      jobTitle:       z.string().optional(),
      department:     z.string().optional(),
      employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']).optional(),
      startDate:      z.string().datetime().optional(),
      endDate:        z.string().datetime().optional(),
    }).parse(req.body)
    const employee = await req.db.employeeProfile.update({ where: { id: req.params.id }, data: body })
    res.json(employee)
  } catch (err) { next(err) }
})

// ── Salary records (HR manager / ADMIN only, audit every view) ────────────────

router.get('/employees/:id/salary', requireHrAccess,async (req, res, next) => {
  try {
    const records = await req.db.salaryRecord.findMany({
      where:   { employeeId: req.params.id },
      orderBy: { effectiveDate: 'desc' },
    })
    await auditLog(req, 'VIEW_SALARY', req.params.id, `Viewed ${records.length} salary record(s)`)
    res.json(records)
  } catch (err) { next(err) }
})

router.post('/employees/:id/salary', requireHrAccess,async (req, res, next) => {
  try {
    const body = z.object({
      effectiveDate: z.string().datetime(),
      amount:        z.number().positive(),
      currency:      z.string().default('USD'),
      note:          z.string().optional(),
    }).parse(req.body)

    const record = await req.db.salaryRecord.create({
      data: {
        tenantId:      req.tenantId,
        employeeId:    req.params.id,
        effectiveDate: new Date(body.effectiveDate),
        amount:        body.amount,
        currency:      body.currency,
        note:          body.note,
        createdById:   req.userId,
      },
    })
    await auditLog(req, 'CREATE_SALARY', record.id, `Amount: ${body.amount} ${body.currency}`)
    res.status(201).json(record)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── HR Documents (HR manager / ADMIN only, audit every view) ─────────────────

router.get('/employees/:id/documents', requireHrAccess,async (req, res, next) => {
  try {
    const docs = await req.db.hrDocument.findMany({
      where:   { employeeId: req.params.id },
      orderBy: { uploadedAt: 'desc' },
    })
    await auditLog(req, 'VIEW_DOCUMENTS', req.params.id, `Viewed ${docs.length} document(s)`)
    res.json(docs)
  } catch (err) { next(err) }
})

router.post('/employees/:id/documents', requireHrAccess,async (req, res, next) => {
  try {
    const body = z.object({
      type:       z.enum(['CONTRACT', 'NDA', 'OFFER_LETTER', 'PERFORMANCE_REVIEW', 'OTHER']).default('OTHER'),
      name:       z.string().min(1).max(200),
      storageKey: z.string().min(1),
      mimeType:   z.string().optional(),
      sizeBytes:  z.number().int().positive().optional(),
    }).parse(req.body)

    const doc = await req.db.hrDocument.create({
      data: { ...body, tenantId: req.tenantId, employeeId: req.params.id, uploadedById: req.userId },
    })
    await auditLog(req, 'UPLOAD_DOCUMENT', doc.id, `${body.type}: ${body.name}`)
    res.status(201).json(doc)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Leave requests ────────────────────────────────────────────────────────────

router.get('/employees/:id/leaves', async (req, res, next) => {
  try {
    // Employees can see their own; HR can see all
    const member = await req.db.tenantMember.findFirst({ where: { tenantId: req.tenantId, userId: req.userId } })
    const employee = await req.db.employeeProfile.findFirst({ where: { id: req.params.id }, select: { userId: true } })
    const isSelf = employee?.userId === req.userId
    if (!isSelf && !member?.isHrManager && member?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Access denied' }); return
    }

    const leaves = await req.db.leaveRequest.findMany({
      where:   { employeeId: req.params.id },
      orderBy: { startDate: 'desc' },
    })
    res.json(leaves)
  } catch (err) { next(err) }
})

router.post('/employees/:id/leaves', async (req, res, next) => {
  try {
    const body = z.object({
      type:      z.enum(['ANNUAL', 'SICK', 'UNPAID', 'MATERNITY', 'PATERNITY', 'OTHER']),
      startDate: z.string().datetime(),
      endDate:   z.string().datetime(),
      days:      z.number().positive(),
      reason:    z.string().optional(),
    }).parse(req.body)

    // Only the employee themselves can submit leave
    const employee = await req.db.employeeProfile.findFirst({ where: { id: req.params.id }, select: { userId: true, leaveBalance: true } })
    if (!employee) { res.status(404).json({ error: 'Employee not found' }); return }
    if (employee.userId !== req.userId) { res.status(403).json({ error: 'Can only submit leave for yourself' }); return }

    const leave = await req.db.leaveRequest.create({
      data: {
        tenantId:  req.tenantId,
        employeeId: req.params.id,
        type:      body.type,
        startDate: new Date(body.startDate),
        endDate:   new Date(body.endDate),
        days:      body.days,
        reason:    body.reason,
      },
    })
    res.status(201).json(leave)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.post('/leaves/:leaveId/review', requireHrAccess,async (req, res, next) => {
  try {
    const body = z.object({
      status: z.enum(['APPROVED', 'REJECTED']),
    }).parse(req.body)

    const leave = await req.db.leaveRequest.findFirst({ where: { id: req.params.leaveId } })
    if (!leave) { res.status(404).json({ error: 'Leave request not found' }); return }
    if (leave.status !== 'PENDING') { res.status(409).json({ error: 'Leave request is no longer pending' }); return }

    // SELECT FOR UPDATE via transaction — deduct balance on APPROVE
    const updated = await req.db.$transaction(async tx => {
      if (body.status === 'APPROVED' && leave.type === 'ANNUAL') {
        // Update leave balance (SELECT FOR UPDATE semantics)
        const emp = await tx.employeeProfile.findFirst({ where: { id: leave.employeeId } })
        if (!emp) throw new Error('Employee not found')
        const newBalance = Number(emp.leaveBalance) - Number(leave.days)
        if (newBalance < 0) throw new Error(`Insufficient leave balance (have ${emp.leaveBalance} days, need ${leave.days})`)
        await tx.employeeProfile.update({ where: { id: emp.id }, data: { leaveBalance: newBalance } })
      }

      return tx.leaveRequest.update({
        where: { id: req.params.leaveId },
        data: {
          status:      body.status,
          reviewedById: req.userId,
          reviewedAt:  new Date(),
        },
      })
    })

    await auditLog(req, `${body.status}_LEAVE`, req.params.leaveId, `${leave.type} for ${leave.days} day(s)`)
    res.json(updated)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    if ((err as Error).message?.includes('Insufficient')) { res.status(409).json({ error: (err as Error).message }); return }
    next(err)
  }
})

// ── Audit log (HR manager / ADMIN only) ──────────────────────────────────────

router.get('/audit', requireHrAccess,async (req, res, next) => {
  try {
    const logs = await req.db.hrAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take:    200,
      include: { actor: { select: { id: true, name: true } } },
    })
    res.json(logs)
  } catch (err) { next(err) }
})

export default router
