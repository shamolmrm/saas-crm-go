import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken }   from '../lib/jwt.js'
import { scopedPrisma, prisma } from '@crm/db'

declare global {
  namespace Express {
    interface Request {
      userId:   string
      tenantId: string
      role:     string
      isHrManager: boolean
      db:       ReturnType<typeof scopedPrisma>
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }

  const token = header.slice(7)
  let payload

  try {
    payload = verifyAccessToken(token)
  } catch {
    res.status(401).json({ error: 'Token expired or invalid' })
    return
  }

  req.userId   = payload.sub
  req.tenantId = payload.tenantId
  req.role     = payload.role
  req.db       = scopedPrisma(payload.tenantId)

  // Load isHrManager lazily in middleware (Phase 3e — safe to include from v0)
  prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId: payload.tenantId, userId: payload.sub } },
    select: { isHrManager: true },
  }).then((member: { isHrManager: boolean } | null) => {
    req.isHrManager = member?.isHrManager ?? false
    next()
  }).catch(() => {
    req.isHrManager = false
    next()
  })
}
