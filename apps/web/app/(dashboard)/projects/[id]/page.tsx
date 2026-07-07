'use client'

import { useState } from 'react'
import { useParams }  from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api }        from '@/lib/api'
import { Plus, ChevronDown, Clock, X, ArrowLeft, Check, Timer } from 'lucide-react'
import Link from 'next/link'

interface Task {
  id: string; title: string; status: string; priority: string; dueDate?: string
  assignee?: { id: string; name: string }
  subtasks?: Task[]
  _count: { timeEntries: number }
}

interface TimeEntry {
  id: string; minutes: number; description?: string; startedAt: string; billedLineItemId?: string
  user: { id: string; name: string }
  task?: { id: string; title: string }
}

interface Project {
  id: string; name: string; description?: string; status: string; color: string
  contact?: { id: string; name: string }
  deal?: { id: string; title: string }
  tasks: Task[]
  _count: { tasks: number; timeEntries: number }
  budget?: number; dueDate?: string
}

const PRIORITY_COLOR: Record<string, string> = {
  LOW: 'text-slate-500', MEDIUM: 'text-amber-500', HIGH: 'text-orange-500', URGENT: 'text-red-600',
}

const STATUS_ICON: Record<string, string> = {
  TODO: '○', IN_PROGRESS: '◑', REVIEW: '◕', DONE: '●',
}

export default function ProjectDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const qc       = useQueryClient()
  const [tab, setTab]           = useState<'tasks' | 'time'>('tasks')
  const [showTask, setShowTask] = useState(false)
  const [showTime, setShowTime] = useState(false)
  const [taskForm, setTaskForm] = useState({ title: '', priority: 'MEDIUM', status: 'TODO' })
  const [timeForm, setTimeForm] = useState({ minutes: '30', description: '' })

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn:  () => api.get<Project>(`/projects/${id}`).then(r => r.data),
  })

  const { data: timeEntries = [] } = useQuery({
    queryKey: ['project-time', id],
    queryFn:  () => api.get<TimeEntry[]>(`/projects/${id}/time`).then(r => r.data),
    enabled:  tab === 'time',
  })

  const createTaskMut = useMutation({
    mutationFn: () => api.post(`/projects/${id}/tasks`, {
      title:    taskForm.title,
      priority: taskForm.priority,
      status:   taskForm.status,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['project', id] }); setShowTask(false); setTaskForm({ title: '', priority: 'MEDIUM', status: 'TODO' }) },
  })

  const updateTaskMut = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      api.patch(`/projects/${id}/tasks/${taskId}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }),
  })

  const logTimeMut = useMutation({
    mutationFn: () => api.post(`/projects/${id}/time`, {
      minutes:     Number(timeForm.minutes),
      description: timeForm.description || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-time', id] })
      setShowTime(false)
      setTimeForm({ minutes: '30', description: '' })
    },
  })

  if (isLoading) return <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
  if (!project) return <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Project not found.</div>

  const totalMinutes = timeEntries.reduce((s, e) => s + e.minutes, 0)

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="border-b px-6 py-4 shrink-0">
        <Link href="/projects" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft size={12} /> All projects
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
          <div>
            <h1 className="text-xl font-semibold">{project.name}</h1>
            {project.contact && <p className="text-xs text-muted-foreground">{project.contact.name}</p>}
          </div>
          {project.dueDate && (
            <span className="ml-auto text-xs text-muted-foreground">Due {new Date(project.dueDate).toLocaleDateString()}</span>
          )}
        </div>
        {project.description && <p className="text-sm text-muted-foreground mt-1">{project.description}</p>}
      </div>

      {/* Tabs */}
      <div className="border-b px-6 flex gap-1 shrink-0">
        {(['tasks', 'time'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >{t === 'tasks' ? `Tasks (${project._count.tasks})` : `Time (${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m)`}</button>
        ))}
        <div className="ml-auto py-1.5 flex gap-2">
          {tab === 'tasks' && (
            <button onClick={() => setShowTask(true)}
              className="flex items-center gap-1 bg-primary text-primary-foreground rounded-md px-2.5 py-1 text-xs font-medium"
            ><Plus size={12} /> Add task</button>
          )}
          {tab === 'time' && (
            <button onClick={() => setShowTime(true)}
              className="flex items-center gap-1 bg-primary text-primary-foreground rounded-md px-2.5 py-1 text-xs font-medium"
            ><Timer size={12} /> Log time</button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {tab === 'tasks' && (
          <div className="divide-y">
            {project.tasks.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm">No tasks yet. Add one to get started.</div>
            ) : (
              project.tasks.map(task => (
                <div key={task.id}>
                  <div className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20">
                    <button onClick={() => {
                      const next = { TODO: 'IN_PROGRESS', IN_PROGRESS: 'REVIEW', REVIEW: 'DONE', DONE: 'TODO' }
                      updateTaskMut.mutate({ taskId: task.id, status: (next as Record<string, string>)[task.status] })
                    }} className="text-muted-foreground hover:text-primary text-base shrink-0">{STATUS_ICON[task.status]}</button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${task.status === 'DONE' ? 'line-through text-muted-foreground' : ''}`}>{task.title}</p>
                      {task.assignee && <p className="text-xs text-muted-foreground">{task.assignee.name}</p>}
                    </div>
                    <span className={`text-xs font-medium ${PRIORITY_COLOR[task.priority]}`}>{task.priority}</span>
                    {task.dueDate && <span className="text-xs text-muted-foreground">{new Date(task.dueDate).toLocaleDateString()}</span>}
                    {task._count.timeEntries > 0 && <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Clock size={10} />{task._count.timeEntries}</span>}
                  </div>
                  {/* Subtasks */}
                  {task.subtasks?.map(sub => (
                    <div key={sub.id} className="flex items-center gap-3 px-5 py-2 pl-12 bg-muted/10 hover:bg-muted/20">
                      <span className="text-muted-foreground text-xs shrink-0">{STATUS_ICON[sub.status]}</span>
                      <p className={`text-xs ${sub.status === 'DONE' ? 'line-through text-muted-foreground' : ''}`}>{sub.title}</p>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'time' && (
          <div className="divide-y">
            {timeEntries.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm">No time logged yet.</div>
            ) : (
              timeEntries.map(e => (
                <div key={e.id} className={`flex items-center gap-3 px-5 py-3 ${e.billedLineItemId ? 'opacity-60' : ''}`}>
                  <Clock size={14} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{e.description ?? '(no description)'}</p>
                    <p className="text-xs text-muted-foreground">{e.user.name} · {new Date(e.startedAt).toLocaleDateString()}{e.task ? ` · ${e.task.title}` : ''}</p>
                  </div>
                  <span className="text-sm font-medium shrink-0">{Math.floor(e.minutes / 60)}h {e.minutes % 60}m</span>
                  {e.billedLineItemId && <span className="text-xs text-blue-600 font-medium shrink-0">Billed</span>}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Add task modal */}
      {showTask && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Add task</h2>
              <button onClick={() => setShowTask(false)}><X size={16} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <input value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Task title *"
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="grid grid-cols-2 gap-2">
                <select value={taskForm.priority} onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))}
                  className="w-full border rounded-md px-2 py-2 text-sm bg-background focus:outline-none"
                >
                  {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={taskForm.status} onChange={e => setTaskForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full border rounded-md px-2 py-2 text-sm bg-background focus:outline-none"
                >
                  {['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowTask(false)} className="border rounded-md px-3 py-2 text-sm hover:bg-muted">Cancel</button>
              <button onClick={() => createTaskMut.mutate()} disabled={!taskForm.title || createTaskMut.isPending}
                className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
              >{createTaskMut.isPending ? '…' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Log time modal */}
      {showTime && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Log time</h2>
              <button onClick={() => setShowTime(false)}><X size={16} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Duration (minutes) *</label>
                <input type="number" value={timeForm.minutes} onChange={e => setTimeForm(f => ({ ...f, minutes: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Description</label>
                <input value={timeForm.description} onChange={e => setTimeForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowTime(false)} className="border rounded-md px-3 py-2 text-sm hover:bg-muted">Cancel</button>
              <button onClick={() => logTimeMut.mutate()} disabled={!timeForm.minutes || logTimeMut.isPending}
                className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
              >{logTimeMut.isPending ? '…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
