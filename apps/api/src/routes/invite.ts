import { Router } from 'express'
import { z }       from 'zod'
import argon2      from 'argon2'
import { prisma }  from '@crm/db'
import { issueAccessToken, issueRefreshToken } from '../lib/jwt.js'

const router = Router()

// ── GET /invite?token= — preview invite (no auth) ─────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string() }).parse(req.query)

    const invitation = await prisma.invitation.findUnique({
      where:   { token },
      include: { tenant: { select: { name: true } } },
    })

    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
      res.status(410).json({ error: 'Invitation is invalid or has expired' }); return
    }

    res.json({
      email:      invitation.email,
      role:       invitation.role,
      tenantName: invitation.tenant.name,
      expiresAt:  invitation.expiresAt,
    })
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'token is required' }); return }
    next(err)
  }
})

// ── POST /invite/accept — accept invite (creates account or logs in) ──────────
router.post('/accept', async (req, res, next) => {
  try {
    const body = z.object({
      token:    z.string(),
      name:     z.string().min(1).max(100).optional(),
      password: z.string().min(8).max(128).optional(),
    }).parse(req.body)

    const invitation = await prisma.invitation.findUnique({
      where: { token: body.token },
    })

    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
      res.status(410).json({ error: 'Invitation is invalid or has expired' }); return
    }

    let userId: string

    // Check if user already exists (existing user accepting invite to a new workspace)
    const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } })

    if (existingUser) {
      userId = existingUser.id
    } else {
      // New user — name + password required
      if (!body.name || !body.password) {
        res.status(400).json({ error: 'Name and password are required for new accounts' }); return
      }
      const passwordHash = await argon2.hash(body.password)
      const newUser = await prisma.user.create({
        data: { name: body.name, email: invitation.email, passwordHash },
      })
      userId = newUser.id
    }

    // Add to tenant (idempotent — skip if already member)
    await prisma.tenantMember.upsert({
      where:  { tenantId_userId: { tenantId: invitation.tenantId, userId } },
      create: { tenantId: invitation.tenantId, userId, role: invitation.role },
      update: {},
    })

    // Mark invitation accepted
    await prisma.invitation.update({
      where: { id: invitation.id },
      data:  { acceptedAt: new Date() },
    })

    const [accessToken, refreshToken] = await Promise.all([
      issueAccessToken(userId, invitation.tenantId),
      issueRefreshToken(userId),
    ])

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, name: true, email: true },
    })

    res.json({ accessToken, refreshToken, user })
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', issues: err.issues }); return }
    next(err)
  }
})

export default router
