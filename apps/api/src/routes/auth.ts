import { Router }  from 'express'
import rateLimit    from 'express-rate-limit'
import argon2       from 'argon2'
import { z }                 from 'zod'
import { prisma, type Prisma } from '@crm/db'
import {
  issueAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from '../lib/jwt.js'
import { authenticate } from '../middleware/authenticate.js'

const router = Router()

// Strict rate-limit on auth endpoints to slow brute-force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 20,
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
})

// ── Register ──────────────────────────────────────────────────────────────────
const RegisterSchema = z.object({
  name:         z.string().min(1).max(100),
  email:        z.string().email(),
  password:     z.string().min(8).max(128),
  tenantName:   z.string().min(1).max(100).optional(),
  tenantId:     z.string().optional(),   // join existing tenant via invitation (Phase 1a)
})

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const body = RegisterSchema.parse(req.body)

    const existing = await prisma.user.findUnique({ where: { email: body.email } })
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists' })
      return
    }

    const passwordHash = await argon2.hash(body.password)

    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: { name: body.name, email: body.email, passwordHash },
      })

      // Create a new tenant or join an existing one
      const tenantId = body.tenantId ?? (
        await tx.tenant.create({
          data: {
            name:      body.tenantName ?? `${body.name}'s Workspace`,
            subdomain: null,
            isActive:  true,
            plan:      'trial',
          },
        })
      ).id

      await tx.tenantMember.create({
        data: { tenantId, userId: user.id, role: 'ADMIN' },
      })

      // Seed default pipeline for new tenants
      if (!body.tenantId) {
        await tx.pipeline.create({
          data: {
            tenantId,
            name:      'Sales Pipeline',
            isDefault: true,
            stages: {
              create: [
                { name: 'Lead',        position: 0 },
                { name: 'Qualified',   position: 1 },
                { name: 'Proposal',    position: 2 },
                { name: 'Negotiation', position: 3 },
                { name: 'Closed Won',  position: 4 },
              ],
            },
          },
        })
      }

      return { ...user, tenantId }
    })

    const [accessToken, refreshToken] = await Promise.all([
      issueAccessToken(user.id, user.tenantId),
      issueRefreshToken(user.id),
    ])

    res.status(201).json({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email },
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', issues: err.issues })
      return
    }
    next(err)
  }
})

// ── Login ─────────────────────────────────────────────────────────────────────
const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
  tenantId: z.string().optional(),  // Phase 1a: specify which tenant to log into
})

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const body = LoginSchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { email: body.email } })
    // Constant-time check even on missing user (prevents user enumeration)
    const passwordOk = user
      ? await argon2.verify(user.passwordHash, body.password)
      : await argon2.hash('dummy').then(() => false)

    if (!user || !passwordOk) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    // Determine which tenant to log into
    let tenantId = body.tenantId
    if (!tenantId) {
      const memberships = await prisma.tenantMember.findMany({
        where: { userId: user.id },
        select: { tenantId: true },
      })
      if (memberships.length === 0) {
        res.status(403).json({ error: 'User has no tenant memberships' })
        return
      }
      if (memberships.length > 1 && !body.tenantId) {
        // Phase 1a: multiple tenants — client must specify which one
        res.status(300).json({
          error: 'Multiple tenants — specify tenantId',
          tenantIds: memberships.map(m => m.tenantId),
        })
        return
      }
      tenantId = memberships[0].tenantId
    }

    // Verify membership in chosen tenant
    const resolvedTenantId = tenantId!  // guaranteed set: either from body or from memberships array above
    const member = await prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId: resolvedTenantId, userId: user.id } },
      include: { tenant: { select: { isActive: true } } },
    })
    if (!member || !member.tenant.isActive) {
      res.status(403).json({ error: 'Access denied to this workspace' })
      return
    }

    const [accessToken, refreshToken] = await Promise.all([
      issueAccessToken(user.id, resolvedTenantId),
      issueRefreshToken(user.id),
    ])

    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: member.role },
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', issues: err.issues })
      return
    }
    next(err)
  }
})

// ── Refresh ───────────────────────────────────────────────────────────────────
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body)

    const result = await rotateRefreshToken(refreshToken)
    if (!result) {
      res.status(401).json({ error: 'Refresh token invalid or expired' })
      return
    }

    // Get the user's current (only) tenant — Phase 1a will handle multi-tenant properly
    const membership = await prisma.tenantMember.findFirst({
      where: { userId: result.userId },
      select: { tenantId: true },
    })
    if (!membership) {
      res.status(403).json({ error: 'No tenant membership found' })
      return
    }

    const accessToken = await issueAccessToken(result.userId, membership.tenantId)

    res.json({ accessToken, refreshToken: result.newRaw })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'refreshToken is required' })
      return
    }
    next(err)
  }
})

// ── Logout ────────────────────────────────────────────────────────────────────
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body)
    await revokeRefreshToken(refreshToken)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// ── Switch workspace ──────────────────────────────────────────────────────────
router.post('/switch-workspace', authenticate, async (req, res, next) => {
  try {
    const { tenantId } = z.object({ tenantId: z.string() }).parse(req.body)
    const member = await prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId: req.userId } },
      include: { tenant: { select: { isActive: true } } },
    })
    if (!member || !member.tenant.isActive) {
      res.status(403).json({ error: 'Access denied to this workspace' }); return
    }
    const accessToken = await issueAccessToken(req.userId, tenantId)
    res.json({ accessToken })
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'tenantId is required' }); return }
    next(err)
  }
})

// ── My workspaces ─────────────────────────────────────────────────────────────
router.get('/workspaces', authenticate, async (req, res, next) => {
  try {
    const memberships = await prisma.tenantMember.findMany({
      where:   { userId: req.userId },
      include: { tenant: { select: { id: true, name: true, subdomain: true, plan: true } } },
    })
    res.json(memberships.map(m => ({ ...m.tenant, role: m.role })))
  } catch (err) { next(err) }
})

// ── Me ────────────────────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true },
    })
    const member = await prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId: req.tenantId, userId: req.userId } },
      select: { role: true, isHrManager: true },
    })
    res.json({ ...user, role: member?.role, isHrManager: member?.isHrManager })
  } catch (err) {
    next(err)
  }
})

export default router
