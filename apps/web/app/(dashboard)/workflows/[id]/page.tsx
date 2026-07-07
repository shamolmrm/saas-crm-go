'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter }             from 'next/navigation'
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type Connection,
  type NodeChange, type EdgeChange,
  Handle, Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api }       from '@/lib/api'
import { ArrowLeft, Plus, Save, Play, Trash2, X } from 'lucide-react'
import Link          from 'next/link'

// ── Workflow API ──────────────────────────────────────────────────────────────
const wfApi = {
  get:    (id: string) => api.get<{ id: string; name: string; isActive: boolean; definition: WorkflowDef; _count: { runs: number } }>(`/workflows/${id}`),
  update: (id: string, d: object) => api.patch(`/workflows/${id}`, d),
  runs:   (id: string) => api.get<RunRecord[]>(`/workflows/${id}/runs`),
  activate:   (id: string) => api.post(`/workflows/${id}/activate`),
  deactivate: (id: string) => api.post(`/workflows/${id}/deactivate`),
}

interface WorkflowNode { id: string; type: string; data: Record<string, unknown>; position?: { x: number; y: number } }
interface WorkflowEdge { source: string; target: string; label?: string }
interface WorkflowDef  { nodes: WorkflowNode[]; edges: WorkflowEdge[] }
interface RunRecord    { id: string; status: string; startedAt: string; error?: string }

// ── Node configs ─────────────────────────────────────────────────────────────
const NODE_TYPES_CONFIG = [
  { type: 'TRIGGER',   label: 'Trigger',   color: 'bg-blue-500',   options: ['DEAL_STAGE_CHANGED', 'CONTACT_CREATED', 'DEAL_CREATED', 'DEAL_WON', 'DEAL_LOST'] },
  { type: 'CONDITION', label: 'Condition', color: 'bg-amber-500',  options: [] },
  { type: 'DELAY',     label: 'Delay',     color: 'bg-purple-500', options: [] },
  { type: 'ACTION',    label: 'Action',    color: 'bg-green-500',  options: ['SEND_EMAIL', 'UPDATE_DEAL_STAGE', 'CREATE_ACTIVITY'] },
]

// ── Custom node component ─────────────────────────────────────────────────────
function WorkflowNodeComponent({ data }: { data: Record<string, unknown> }) {
  const cfg = NODE_TYPES_CONFIG.find(n => n.type === data.type) ?? NODE_TYPES_CONFIG[0]
  return (
    <div className={`rounded-lg border-2 bg-white shadow-md min-w-[160px] ${data.selected ? 'border-primary' : 'border-transparent'}`}>
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      <div className={`${cfg.color} text-white text-xs font-semibold px-3 py-1.5 rounded-t-md flex items-center gap-1.5`}>
        {cfg.label}
      </div>
      <div className="px-3 py-2 text-sm">
        <p className="font-medium text-gray-800 truncate max-w-[140px]">
          {String(data.label ?? data.triggerType ?? data.action ?? data.type ?? '')}
        </p>
        {!!data.subject && <p className="text-xs text-gray-500 truncate">{String(data.subject)}</p>}
        {!!data.delayMinutes && <p className="text-xs text-gray-500">Wait {String(data.delayMinutes)} min</p>}
        {!!data.field && <p className="text-xs text-gray-500">{String(data.field)} {String(data.operator)} {String(data.value)}</p>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  )
}

const nodeTypes = { workflowNode: WorkflowNodeComponent }

// ── Main builder page ─────────────────────────────────────────────────────────
export default function WorkflowBuilderPage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()
  const qc       = useQueryClient()

  const [rfNodes, setRfNodes] = useState<Node[]>([])
  const [rfEdges, setRfEdges] = useState<Edge[]>([])
  const [selected, setSelected] = useState<Node | null>(null)
  const [dirty, setDirty]     = useState(false)

  const { data: wf } = useQuery({
    queryKey: ['workflow', id],
    queryFn:  () => wfApi.get(id).then(r => r.data),
  })

  const { data: runs = [] } = useQuery({
    queryKey: ['workflow-runs', id],
    queryFn:  () => wfApi.runs(id).then(r => r.data),
    refetchInterval: 5000,
  })

  // Sync definition → React Flow nodes/edges
  useEffect(() => {
    if (!wf) return
    const def = wf.definition as WorkflowDef
    setRfNodes(def.nodes.map((n, i) => ({
      id:   n.id,
      type: 'workflowNode',
      position: n.position ?? { x: 250 + (i % 3) * 200, y: 80 + Math.floor(i / 3) * 160 },
      data: { ...n.data, type: n.type },
    })))
    setRfEdges(def.edges.map(e => ({
      id:     `${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      label:  e.label,
      type:   'smoothstep',
    })))
  }, [wf])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setRfNodes(n => applyNodeChanges(changes, n))
    setDirty(true)
  }, [])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setRfEdges(e => applyEdgeChanges(changes, e))
    setDirty(true)
  }, [])
  const onConnect = useCallback((conn: Connection) => {
    setRfEdges(e => addEdge({ ...conn, type: 'smoothstep' }, e))
    setDirty(true)
  }, [])

  const addNode = (type: string) => {
    const cfg  = NODE_TYPES_CONFIG.find(n => n.type === type)!
    const newNode: Node = {
      id:       `${type.toLowerCase()}-${Date.now()}`,
      type:     'workflowNode',
      position: { x: 250, y: 80 + rfNodes.length * 160 },
      data:     { type, label: cfg.label, triggerType: cfg.options[0] ?? '' },
    }
    setRfNodes(n => [...n, newNode])
    setDirty(true)
  }

  const updateSelectedData = (key: string, val: string) => {
    if (!selected) return
    setRfNodes(ns => ns.map(n => n.id === selected.id ? { ...n, data: { ...n.data, [key]: val } } : n))
    setSelected(s => s ? { ...s, data: { ...s.data, [key]: val } } : s)
    setDirty(true)
  }

  const deleteSelected = () => {
    if (!selected) return
    setRfNodes(ns => ns.filter(n => n.id !== selected.id))
    setRfEdges(es => es.filter(e => e.source !== selected.id && e.target !== selected.id))
    setSelected(null)
    setDirty(true)
  }

  const buildDefinition = (): WorkflowDef => ({
    nodes: rfNodes.map(n => ({ id: n.id, type: String(n.data.type), data: n.data, position: n.position })),
    edges: rfEdges.map(e => ({ source: e.source, target: e.target, label: e.label as string | undefined })),
  })

  const saveMut = useMutation({
    mutationFn: () => wfApi.update(id, { definition: buildDefinition() }),
    onSuccess:  () => { setDirty(false); qc.invalidateQueries({ queryKey: ['workflow', id] }) },
  })

  const toggleMut = useMutation({
    mutationFn: () => wf?.isActive ? wfApi.deactivate(id) : wfApi.activate(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['workflow', id] }),
  })

  const STATUS_COLOR: Record<string, string> = {
    COMPLETED: 'text-green-600', FAILED: 'text-destructive',
    RUNNING: 'text-blue-600', PENDING: 'text-muted-foreground', WAITING: 'text-amber-600',
  }

  return (
    <div className="flex h-full">
      {/* Left panel — node palette + run history */}
      <div className="w-56 border-r flex flex-col shrink-0 bg-background">
        <div className="p-3 border-b">
          <Link href="/workflows" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} /> Workflows
          </Link>
          <p className="font-semibold text-sm mt-2 truncate">{wf?.name}</p>
        </div>

        <div className="p-3 border-b">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Add node</p>
          <div className="space-y-1">
            {NODE_TYPES_CONFIG.map(cfg => (
              <button key={cfg.type} onClick={() => addNode(cfg.type)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm rounded hover:bg-muted text-left"
              >
                <span className={`w-2 h-2 rounded-full ${cfg.color}`} />
                {cfg.label}
                <Plus size={12} className="ml-auto text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Recent runs</p>
          {runs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No runs yet</p>
          ) : (
            <div className="space-y-1">
              {runs.slice(0, 10).map(r => (
                <div key={r.id} className="text-xs">
                  <span className={`font-medium ${STATUS_COLOR[r.status] ?? ''}`}>{r.status}</span>
                  <span className="text-muted-foreground ml-1">{new Date(r.startedAt).toLocaleTimeString()}</span>
                  {r.error && <p className="text-destructive truncate">{r.error}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="border-b px-4 py-2 flex items-center gap-2 bg-background">
          {dirty && <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>}
          <div className="ml-auto flex gap-2">
            <button onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}
              className="flex items-center gap-1.5 border rounded-md px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            ><Save size={13} /> {saveMut.isPending ? 'Saving…' : 'Save'}</button>
            <button onClick={() => toggleMut.mutate()}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${wf?.isActive ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
            >
              <Play size={13} /> {wf?.isActive ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </div>

        <div className="flex-1 relative">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelected(node)}
            onPaneClick={() => setSelected(null)}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>

          {/* Node config panel */}
          {selected && (
            <div className="absolute top-3 right-3 w-64 bg-background border rounded-lg shadow-lg p-4 z-10">
              <div className="flex items-center justify-between mb-3">
                <p className="font-medium text-sm">{String(selected.data.type)} node</p>
                <div className="flex gap-1">
                  <button onClick={deleteSelected} className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={13} /></button>
                  <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground p-1"><X size={13} /></button>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Label</label>
                  <input
                    value={String(selected.data.label ?? '')}
                    onChange={e => updateSelectedData('label', e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                {selected.data.type === 'TRIGGER' && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Trigger event</label>
                    <select value={String(selected.data.triggerType ?? '')}
                      onChange={e => updateSelectedData('triggerType', e.target.value)}
                      className="w-full border rounded px-2 py-1 text-sm focus:outline-none"
                    >
                      {NODE_TYPES_CONFIG[0].options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                )}

                {selected.data.type === 'ACTION' && (
                  <>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Action type</label>
                      <select value={String(selected.data.action ?? '')}
                        onChange={e => updateSelectedData('action', e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm focus:outline-none"
                      >
                        {NODE_TYPES_CONFIG[3].options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                    {selected.data.action === 'SEND_EMAIL' && (
                      <>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">To (use {'{{contactEmail}}'})</label>
                          <input value={String(selected.data.to ?? '')} onChange={e => updateSelectedData('to', e.target.value)}
                            className="w-full border rounded px-2 py-1 text-sm focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">Subject</label>
                          <input value={String(selected.data.subject ?? '')} onChange={e => updateSelectedData('subject', e.target.value)}
                            className="w-full border rounded px-2 py-1 text-sm focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">Body</label>
                          <textarea value={String(selected.data.body ?? '')} onChange={e => updateSelectedData('body', e.target.value)}
                            rows={3} className="w-full border rounded px-2 py-1 text-sm focus:outline-none resize-none" />
                        </div>
                      </>
                    )}
                  </>
                )}

                {selected.data.type === 'DELAY' && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Wait (minutes)</label>
                    <input type="number" min="1" value={String(selected.data.delayMinutes ?? 60)}
                      onChange={e => updateSelectedData('delayMinutes', e.target.value)}
                      className="w-full border rounded px-2 py-1 text-sm focus:outline-none" />
                  </div>
                )}

                {selected.data.type === 'CONDITION' && (
                  <>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Field (e.g. dealValue)</label>
                      <input value={String(selected.data.field ?? '')} onChange={e => updateSelectedData('field', e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Operator</label>
                      <select value={String(selected.data.operator ?? 'equals')} onChange={e => updateSelectedData('operator', e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm focus:outline-none"
                      >
                        {['equals','not_equals','contains','greater_than','less_than'].map(o => (
                          <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Value</label>
                      <input value={String(selected.data.value ?? '')} onChange={e => updateSelectedData('value', e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm focus:outline-none" />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
