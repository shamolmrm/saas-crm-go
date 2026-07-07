import { Worker, Queue } from 'bullmq'
import { prisma, scopedPrisma, Prisma } from '@crm/db'
import { sendEmail }                     from '../services/emailService.js'

// BullMQ bundles its own ioredis internally.
// Pass a plain connection-options object (not an ioredis instance) to avoid
// the two-ioredis-versions type conflict.
function redisConnection() {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379'
  const parsed = new URL(url)
  return {
    host:     parsed.hostname || 'localhost',
    port:     Number(parsed.port || 6379),
    password: parsed.password || undefined,
    maxRetriesPerRequest: null as unknown as undefined,
  }
}

export const workflowQueue = new Queue('workflows', { connection: redisConnection() })

const MAX_LOOP_COUNT = 10

interface WorkflowNode {
  id:    string
  type:  'TRIGGER' | 'CONDITION' | 'DELAY' | 'ACTION'
  data:  Record<string, unknown>
}

interface WorkflowEdge {
  source: string
  target: string
  label?: string
}

interface WorkflowDefinitionJson {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

interface JobData {
  runId:    string
  tenantId: string
  nodeId:   string
}

export function startWorkflowWorker() {
  const worker = new Worker<JobData>(
    'workflows',
    async (job) => {
      const { runId, tenantId } = job.data
      const db = scopedPrisma(tenantId)

      const run = await db.workflowRun.findFirst({ where: { id: runId } })
      if (!run || run.status === 'COMPLETED' || run.status === 'FAILED') return

      if (run.loopCount >= MAX_LOOP_COUNT) {
        await db.workflowRun.update({
          where: { id: runId },
          data:  { status: 'FAILED', error: `Loop guard: exceeded ${MAX_LOOP_COUNT} iterations` },
        })
        return
      }

      const definition = run.definitionSnapshot as unknown as WorkflowDefinitionJson
      await executeWorkflow(db, run, definition)
    },
    { connection: redisConnection() },
  )

  worker.on('failed', (job, err) => {
    console.error(`Workflow job ${job?.id} failed:`, err.message)
  })

  console.log('Workflow worker started')
}

async function executeWorkflow(
  db: ReturnType<typeof scopedPrisma>,
  run: { id: string; tenantId: string; currentNodeId: string | null; context: Prisma.JsonValue; loopCount: number },
  definition: WorkflowDefinitionJson,
) {
  let nodeId: string | undefined = run.currentNodeId ?? findTriggerNode(definition)
  const ctx = (run.context ?? {}) as Record<string, unknown>

  while (nodeId) {
    const node = definition.nodes.find(n => n.id === nodeId)
    if (!node) break

    await db.workflowRun.update({
      where: { id: run.id },
      data:  { status: 'RUNNING', currentNodeId: nodeId, loopCount: { increment: 1 } },
    })

    try {
      if (node.type === 'ACTION') {
        await executeAction(db, node, ctx)
      } else if (node.type === 'CONDITION') {
        nodeId = evaluateCondition(node, ctx, definition)
        continue
      } else if (node.type === 'DELAY') {
        const delayMs = (node.data['delayMinutes'] as number ?? 0) * 60 * 1000
        await workflowQueue.add('workflows', {
          runId: run.id, tenantId: run.tenantId, nodeId: '',
        }, { delay: delayMs })
        await db.workflowRun.update({ where: { id: run.id }, data: { status: 'WAITING' } })
        return
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await db.workflowRun.update({
        where: { id: run.id },
        data:  { status: 'FAILED', error: msg },
      })
      return
    }

    nodeId = getNextNode(definition, nodeId)
  }

  await db.workflowRun.update({
    where: { id: run.id },
    data:  { status: 'COMPLETED', completedAt: new Date() },
  })
}

function findTriggerNode(def: WorkflowDefinitionJson): string {
  return def.nodes.find(n => n.type === 'TRIGGER')?.id ?? def.nodes[0].id
}

function getNextNode(def: WorkflowDefinitionJson, currentId: string): string | undefined {
  return def.edges.find(e => e.source === currentId)?.target
}

function evaluateCondition(
  node: WorkflowNode,
  ctx: Record<string, unknown>,
  def: WorkflowDefinitionJson,
): string {
  const { field, operator, value } = node.data as { field: string; operator: string; value: unknown }
  const fieldValue = ctx[field]

  let result = false
  switch (operator) {
    case 'equals':       result = fieldValue === value; break
    case 'not_equals':   result = fieldValue !== value; break
    case 'contains':     result = String(fieldValue).includes(String(value)); break
    case 'greater_than': result = Number(fieldValue) > Number(value); break
    case 'less_than':    result = Number(fieldValue) < Number(value); break
  }

  const branchEdge = def.edges.find(e => e.source === node.id && e.label === (result ? 'true' : 'false'))
  return branchEdge?.target ?? getNextNode(def, node.id) ?? ''
}

async function executeAction(
  db: ReturnType<typeof scopedPrisma>,
  node: WorkflowNode,
  ctx: Record<string, unknown>,
): Promise<void> {
  const action = node.data['action'] as string

  switch (action) {
    case 'SEND_EMAIL': {
      const to      = interpolate(String(node.data['to'] ?? ''), ctx)
      const subject = interpolate(String(node.data['subject'] ?? ''), ctx)
      const body    = interpolate(String(node.data['body'] ?? ''), ctx)
      if (to) await sendEmail({ to, subject, html: body })
      break
    }

    case 'UPDATE_DEAL_STAGE': {
      const dealId  = ctx['dealId'] as string | undefined
      const stageId = node.data['stageId'] as string | undefined
      if (dealId && stageId) {
        await db.deal.update({ where: { id: dealId }, data: { stageId } })
      }
      break
    }

    case 'CREATE_ACTIVITY': {
      const contactId = ctx['contactId'] as string | undefined
      const dealId    = ctx['dealId']    as string | undefined
      if (contactId || dealId) {
        await db.activity.create({
          data: {
            tenantId:  '', // injected by scopedPrisma
            type:      String(node.data['activityType'] ?? 'NOTE'),
            subject:   interpolate(String(node.data['subject'] ?? ''), ctx),
            body:      interpolate(String(node.data['body']    ?? ''), ctx),
            ...(contactId ? { contactId } : {}),
            ...(dealId    ? { dealId }    : {}),
          },
        })
      }
      break
    }

    default:
      console.warn(`Unknown workflow action: ${action} — skipping`)
  }
}

function interpolate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key: string) => {
    const val = key.split('.').reduce<unknown>((obj, k) => {
      if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[k]
      return undefined
    }, ctx)
    return val !== undefined ? String(val) : `{{${key}}}`
  })
}

export async function fireTrigger(
  tenantId: string,
  triggerType: string,
  context: Record<string, unknown>,
): Promise<void> {
  const db = scopedPrisma(tenantId)

  const workflows = await db.workflowDefinition.findMany({ where: { isActive: true } })

  for (const wf of workflows) {
    const def = wf.definition as unknown as WorkflowDefinitionJson
    const triggerNode = def.nodes.find(
      n => n.type === 'TRIGGER' && n.data['triggerType'] === triggerType
    )
    if (!triggerNode) continue

    const run = await db.workflowRun.create({
      data: {
        tenantId:             '',  // injected by scopedPrisma
        workflowDefinitionId: wf.id,
        definitionSnapshot:   wf.definition as Prisma.InputJsonValue,
        status:               'PENDING',
        context:              context as Prisma.InputJsonValue,
      },
    })

    await workflowQueue.add('workflows', { runId: run.id, tenantId, nodeId: triggerNode.id })
  }
}
