import type { Request, Response, NextFunction } from 'express'
import type { TenantRole } from '@crm/db'

export function requireRole(...roles: TenantRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!roles.includes(req.role as TenantRole)) {
      res.status(403).json({
        error: `This action requires one of these roles: ${roles.join(', ')}`,
      })
      return
    }
    next()
  }
}
