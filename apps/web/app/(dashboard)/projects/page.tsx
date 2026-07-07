'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api }      from '@/lib/api'
import { Plus, FolderKanban, Users, Clock, X, ChevronRight } from 'lucide-react'
import Link from 'next/link'

interface Project {
  id: string; name: string; description?: string; status: string; color: string
  contact?: { id: string; name: string }
  _count: { tasks: number; timeEntries: number }
  dueDate?: string; budget?: number
  createdAt: string
}

const STATUS_COLOR: Record<string, string> = {
  PLANNING:   'bg-slate-100 text-slate-700',
  ACTIVE:     'bg-green-100 text-green-700',
  PAUSED:     'bg-amber-100 text-amber-700',
  COMPLETED:  'bg-blue-100 text-blue-700',
  CANCELLED:  'bg-red-100 text-red-700',
}

export default function ProjectsPage() {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [form, setForm]       = useState({ name: '', description: '', status: 'PLANNING', dueDate: '' })

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn:  () => api.get<Project[]>('/projects').then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: () => api.post('/projects', {
      name:        form.name,
      description: form.description || undefined,
      status:      form.status,
      dueDate:     form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); setShowNew(false); setForm({ name: '', description: '', status: 'PLANNING', dueDate: '' }) },
  })

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="border-b px-6 py-4 flex items-center gap-4 shrink-0">
        <h1 className="text-xl font-semibold flex items-center gap-2"><FolderKanban size={18} /> Projects</h1>
        <button onClick={() => setShowNew(true)}
          className="ml-auto flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium"
        ><Plus size={14} /> New project</button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading projects…</p>
        ) : projects.length === 0 ? (
          <div className="text-center py-16">
            <FolderKanban size={36} className="text-muted-foreground mx-auto mb-3" />
            <h2 className="font-medium mb-1">No projects yet</h2>
            <p className="text-muted-foreground text-sm">Create your first project to track tasks and time.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => (
              <Link key={p.id} href={`/projects/${p.id}`}
                className="border rounded-xl p-4 hover:shadow-sm hover:border-primary/30 transition-all group"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: p.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm group-hover:text-primary truncate">{p.name}</p>
                    {p.contact && <p className="text-xs text-muted-foreground">{p.contact.name}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLOR[p.status]}`}>{p.status}</span>
                </div>

                {p.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{p.description}</p>}

                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto">
                  <span className="flex items-center gap-1"><Users size={11} /> {p._count.tasks} task{p._count.tasks !== 1 ? 's' : ''}</span>
                  <span className="flex items-center gap-1"><Clock size={11} /> {p._count.timeEntries} entries</span>
                  {p.dueDate && <span className="ml-auto">{new Date(p.dueDate).toLocaleDateString()}</span>}
                  <ChevronRight size={12} className="ml-auto text-muted-foreground/50 group-hover:text-primary" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* New project modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">New project</h2>
              <button onClick={() => setShowNew(false)}><X size={16} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Project name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none bg-background"
                  >
                    {['PLANNING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Due date</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowNew(false)} className="border rounded-md px-3 py-2 text-sm hover:bg-muted">Cancel</button>
              <button onClick={() => createMut.mutate()} disabled={!form.name || createMut.isPending}
                className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
              >{createMut.isPending ? '…' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
