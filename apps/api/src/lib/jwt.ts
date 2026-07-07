import jwt from 'jsonwebtoken'
import { createHash, randomBytes } from 'crypto'
import { prisma } from '@crm/db'

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET!
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!
const ACCESS_TTL     = process.env.JWT_ACCESS_EXPIRES_IN  ?? '15m'
const REFRESH_TTL    = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d'

export interface AccessTokenPayload {
  sub:      string   // userId
  tenantId: string
  role:     string
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL } as jwt.SignOptions)
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const raw  = randomBytes(64).toString('hex')
  const hash = createHash('sha256').update(raw).digest('hex')

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  await prisma.refreshToken.create({
    data: { userId, tokenHash: hash, expiresAt },
  })

  return raw
}

export async function rotateRefreshToken(
  raw: string,
): Promise<{ userId: string; newRaw: string } | null> {
  const hash = createHash('sha256').update(raw).digest('hex')

  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } })
  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) return null

  // Revoke old token and issue a new one atomically
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data:  { revokedAt: new Date() },
  })

  const newRaw = await issueRefreshToken(existing.userId)
  return { userId: existing.userId, newRaw }
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  const hash = createHash('sha256').update(raw).digest('hex')
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hash, revokedAt: null },
    data:  { revokedAt: new Date() },
  }).catch(() => {})  // silently ignore if already revoked/missing
}

// Sign a fresh access token for a userId — reads role from DB
export async function issueAccessToken(userId: string, tenantId: string): Promise<string> {
  const member = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { role: true },
  })
  if (!member) throw new Error('User is not a member of this tenant')

  return signAccessToken({ sub: userId, tenantId, role: member.role })
}
