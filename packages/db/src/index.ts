import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// ── Tenant-scoped client ──────────────────────────────────────────────────────
// All queries automatically inject tenantId into WHERE and CREATE.
// This is the single enforcement point for tenant isolation.
// ESLint rule (configured in apps/api) blocks importing raw `prisma` in route/
// service files — every handler must use req.db (the scoped client) instead.

const TENANT_SCOPED_MODELS = [
  'contact',
  'deal',
  'pipeline',
  'pipelineStage',
  'activity',
  'workflowDefinition',
  'workflowRun',
  'tenantMember',
] as const

type ScopedModel = (typeof TENANT_SCOPED_MODELS)[number]

function isScopedModel(model: string): model is ScopedModel {
  return (TENANT_SCOPED_MODELS as readonly string[]).includes(model)
}

export function scopedPrisma(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const m = model.charAt(0).toLowerCase() + model.slice(1)
          if (!isScopedModel(m)) return query(args)

          const a = args as Record<string, unknown>

          if (operation === 'create') {
            a.data = { ...(a.data as object), tenantId }
          } else if (operation === 'createMany') {
            const data = a.data as object[]
            a.data = data.map((d) => ({ ...d, tenantId }))
          } else if (
            operation === 'findFirst' ||
            operation === 'findFirstOrThrow' ||
            operation === 'findUnique' ||
            operation === 'findUniqueOrThrow' ||
            operation === 'findMany' ||
            operation === 'count' ||
            operation === 'aggregate' ||
            operation === 'groupBy' ||
            operation === 'updateMany' ||
            operation === 'deleteMany'
          ) {
            a.where = { ...(a.where as object), tenantId }
          } else if (operation === 'update') {
            a.where = { ...(a.where as object), tenantId }
          } else if (operation === 'delete') {
            a.where = { ...(a.where as object), tenantId }
          } else if (operation === 'upsert') {
            a.where = { ...(a.where as object), tenantId }
            a.create = { ...(a.create as object), tenantId }
          }

          return query(args)
        },
      },
    },
  })
}

export type ScopedPrismaClient = ReturnType<typeof scopedPrisma>

export * from '@prisma/client'
