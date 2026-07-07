import { Router } from 'express'
import { z }       from 'zod'
import { prisma }  from '@crm/db'
import { authenticate } from '../middleware/authenticate.js'
import { requireRole }  from '../middleware/requireRole.js'
import { sendEmail }    from '../services/emailService.js'

const router = Router()
router.use(authenticate)

// ── Workspace info ────────────────────────────────────────────────────────────
router.get('/workspace', async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
      select: { id: true, name: true, subdomain: true, plan: true, createdAt: true },
    })
    res.json(tenant)
  } catch (err) { next(err) }
})

router.patch('/workspace', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = z.object({
      name:      z.string().min(1).max(100).optional(),
      subdomain: z.string().min(2).max(63).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only').optional(),
    }).parse(req.body)

    if (body.subdomain) {
      const taken = await prisma.tenant.findFirst({
        where: { subdomain: body.subdomain, id: { not: req.tenantId } },
      })
      if (taken) { res.status(409).json({ error: 'Subdomain already taken' }); return }
    }

    const tenant = await prisma.tenant.update({
      where: { id: req.tenantId },
      data:  body,
      select: { id: true, name: true, subdomain: true, plan: true },
    })
    res.json(tenant)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

// ── Team members ──────────────────────────────────────────────────────────────
router.get('/members', async (req, res, next) => {
  try {
    const members = await prisma.tenantMember.findMany({
      where:   { tenantId: req.tenantId },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true } } },
      orderBy: { joinedAt: 'asc' },
    })
    res.json(members)
  } catch (err) { next(err) }
})

router.patch('/members/:userId/role', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { role } = z.object({ role: z.enum(['ADMIN', 'MEMBER']) }).parse(req.body)

    if (req.params.userId === req.userId) {
      res.status(400).json({ error: 'Cannot change your own role' }); return
    }

    const member = await prisma.tenantMember.update({
      where: { tenantId_userId: { tenantId: req.tenantId, userId: req.params.userId } },
      data:  { role },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    res.json(member)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.delete('/members/:userId', requireRole('ADMIN'), async (req, res, next) => {
  try {
    if (req.params.userId === req.userId) {
      res.status(400).json({ error: 'Cannot remove yourself from the workspace' }); return
    }
    await prisma.tenantMember.delete({
      where: { tenantId_userId: { tenantId: req.tenantId, userId: req.params.userId } },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── Invitations ───────────────────────────────────────────────────────────────
router.get('/invitations', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const invitations = await prisma.invitation.findMany({
      where:   { tenantId: req.tenantId, acceptedAt: null, expiresAt: { gt: new Date() } },
      include: { creator: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(invitations)
  } catch (err) { next(err) }
})

router.post('/invitations', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = z.object({
      email: z.string().email(),
      role:  z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
    }).parse(req.body)

    // Check if already a member
    const existingUser = await prisma.user.findUnique({ where: { email: body.email } })
    if (existingUser) {
      const alreadyMember = await prisma.tenantMember.findFirst({
        where: { tenantId: req.tenantId, userId: existingUser.id },
      })
      if (alreadyMember) {
        res.status(409).json({ error: 'This person is already a team member' }); return
      }
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
      select: { name: true },
    })

    const invitation = await prisma.invitation.create({
      data: {
        tenantId:  req.tenantId,
        email:     body.email,
        role:      body.role,
        createdBy: req.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    })

    // Send invite email (non-blocking — don't fail if SMTP not configured)
    const inviteUrl = `${process.env.FRONTEND_URL}/invite?token=${invitation.token}`
    sendEmail({
      to:      body.email,
      subject: `You've been invited to join ${tenant?.name} on CRM`,
      html:    `<p>You've been invited to join <strong>${tenant?.name}</strong>.</p>
                <p><a href="${inviteUrl}">Accept invitation</a></p>
                <p>This link expires in 7 days.</p>`,
    }).catch(() => {})

    res.status(201).json({ ...invitation, inviteUrl })
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

router.delete('/invitations/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.invitation.delete({
      where: { id: req.params.id, tenantId: req.tenantId },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
