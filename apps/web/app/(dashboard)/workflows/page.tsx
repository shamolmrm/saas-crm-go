'use client'

import { useState }   from 'react'
import Link           from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api }        from '@/lib/api'
import { Plus, Play, Pause, Trash2, GitBranch, Clock } from 'lucide-react'

interface Workflow {
  id: string; name: string; isActive: boolean; createdAt: string
  _count: { runs: number }
}

const workflowApi = {
  list:       () => api.get<Workflow[]>('/workflows'),
  create:     (d: { name: string; definition: object }) => api.post<Workflow>('/workflows', d),
  activate:   (id: string) => api.post(`/workflows/${id}/activate`),
  deactivate: (id: string) => api.post(`/workflows/${id}/deactivate`),
  delete:     (id: string) => api.delete(`/workflows/${id}`),
}

const EMPTY_DEFINITION = {
  nodes: [{ id: 'trigger-1', type: 'TRIGGER', data: { triggerType: 'DEAL_STAGE_CHANGED', label: 'Deal Stage Changed' }, position: { x: 250, y: 50 } }],
  edges: [],
}

export default function WorkflowsPage() {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [name, setName]         = useState('')

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn:  () => workflowApi.list().then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: () => workflowApi.create({ name, definition: EMPTY_DEFINITION }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['workflows'] }); setCreating(false); setName('') },
  })

  const toggleMut = useMutation({
    mutationFn: (wf: Workflow) => wf.isActive ? workflowApi.deactivate(wf.id) : workflowApi.activate(wf.id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => workflowApi.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Workflows</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Automate actions based on CRM events</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium"
        ><Plus size={14} /> New workflow</button>
      </div>

      {creating && (
        <div className="border rounded-lg p-4 mb-6 bg-muted/30">
          <h2 className="text-sm font-medium mb-3">New workflow</h2>
          <div className="flex gap-2">
            <input
              value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && name.trim() && createMut.mutate()}
              placeholder="e.g. Welcome new lead"
              autoFocus
              className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            />
            <button onClick={() => setCreating(false)} className="border rounded-md px-3 py-2 text-sm hover:bg-muted">Cancel</button>
            <button
              onClick={() => name.trim() && createMut.mutate()}
              disabled={!name.trim() || createMut.isPending}
              className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
            >{createMut.isPending ? 'Creating…' : 'Create'}</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : workflows.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <GitBranch size={32} className="text-muted-foreground mx-auto mb-3" />
          <h2 className="font-medium mb-1">No workflows yet</h2>
          <p className="text-muted-foreground text-sm">Create your first workflow to automate CRM actions.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map(wf => (
            <div key={wf.id} className="border rounded-lg px-5 py-4 flex items-center gap-4 hover:bg-muted/20 transition-colors">
              <div className={`w-2 h-2 rounded-full shrink-0 ${wf.isActive ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
              <div className="flex-1 min-w-0">
                <Link href={`/workflows/${wf.id}`} className="font-medium hover:text-primary truncate block">
                  {wf.name}
                </Link>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock size={10} /> {wf._count.runs} runs
                  </span>
                  <span className={`text-xs font-medium ${wf.isActive ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {wf.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Link href={`/workflows/${wf.id}`}
                  className="border rounded-md px-2.5 py-1.5 text-xs hover:bg-muted transition-colors"
                >Edit</Link>
                <button onClick={() => toggleMut.mutate(wf)}
                  className="border rounded-md p-1.5 hover:bg-muted transition-colors"
                  title={wf.isActive ? 'Deactivate' : 'Activate'}
                >
                  {wf.isActive ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button
                  onClick={() => { if (confirm(`Delete "${wf.name}"?`)) deleteMut.mutate(wf.id) }}
                  className="border rounded-md p-1.5 hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                ><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
