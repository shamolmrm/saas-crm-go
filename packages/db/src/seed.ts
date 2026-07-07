import { prisma } from './index.js'
import argon2 from 'argon2'

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { subdomain: 'demo' },
    update: {},
    create: {
      name: 'Demo Company',
      subdomain: 'demo',
      isActive: true,
      plan: 'trial',
    },
  })

  const passwordHash = await argon2.hash('password123')

  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@demo.com',
      passwordHash,
    },
  })

  await prisma.tenantMember.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: admin.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: admin.id,
      role: 'ADMIN',
    },
  })

  const pipeline = await prisma.pipeline.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Sales Pipeline' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Sales Pipeline',
      isDefault: true,
      stages: {
        create: [
          { name: 'Lead', position: 0 },
          { name: 'Qualified', position: 1 },
          { name: 'Proposal', position: 2 },
          { name: 'Negotiation', position: 3 },
          { name: 'Closed Won', position: 4 },
        ],
      },
    },
  })

  console.log('Seed complete:', { tenant: tenant.id, admin: admin.id, pipeline: pipeline.id })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
