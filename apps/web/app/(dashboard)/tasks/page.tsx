'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Link from 'next/link'
import { CheckSquare, Clock, AlertCircle, CheckCircle2, FolderKanban, ExternalLink, Filter } from 'lucide-react'

interface ProjectTask {
  id: string; title: string; status: string; priority: string
  dueDate?: string; assigneeId?: string
  project: { id: string; name: string }
}
interface Project { id: string; name: string; tasks: ProjectTask[] }

const PRIORITY_COLOR: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-500', MEDIUM: 'bg-amber-100 text-amber-600',
  HIGH: 'bg-rose-100 text-rose-600', URGENT: 'bg-red-100 text-red-700',
}
const STATUS_ICON: Record<string, React.ReactNode> = {
  TODO:         <CheckSquare size={13} className="text-gray-400"/>,
  IN_PROGRESS:  <Clock size={13} className="text-blue-500"/>,
  IN_REVIEW:    <AlertCircle size={13} className="text-amber-500"/>,
  DONE:         <CheckCircle2 size={13} className="text-emerald-500"/>,
}

function isOverdue(d?: string) { return d && new Date(d) < new Date() }

export default function TasksPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [filter,   setFilter]   = useState<'all'|'todo'|'in_progress'|'overdue'>('all')
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    api.get<{ data: Project[] }>('/projects?limit=50&includeTasks=true')
      .then(r => setProjects(r.data.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const allTasks: ProjectTask[] = projects.flatMap(p =>
    (p.tasks ?? []).map(t => ({ ...t, project: { id: p.id, name: p.name } }))
  )

  const filtered = allTasks.filter(t => {
    if (filter === 'todo')        return t.status === 'TODO'
    if (filter === 'in_progress') return t.status === 'IN_PROGRESS'
    if (filter === 'overdue')     return isOverdue(t.dueDate) && t.status !== 'DONE'
    return true
  })

  const counts = {
    all:         allTasks.length,
    todo:        allTasks.filter(t => t.status === 'TODO').length,
    in_progress: allTasks.filter(t => t.status === 'IN_PROGRESS').length,
    overdue:     allTasks.filter(t => isOverdue(t.dueDate) && t.status !== 'DONE').length,
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CheckSquare size={20} className="text-violet-500"/> Tasks
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">All tasks across your projects</p>
        </div>
        <Link href="/projects"
          className="flex items-center gap-1.5 text-sm text-violet-600 hover:underline font-medium">
          Manage projects <ExternalLink size={13}/>
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-lg w-fit">
        {([
          ['all', 'All'],
          ['todo', 'To Do'],
          ['in_progress', 'In Progress'],
          ['overdue', 'Overdue'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              filter === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              filter === key ? 'bg-violet-100 text-violet-600' : 'bg-gray-200 text-gray-400'
            }`}>{counts[key]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading tasks…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <CheckSquare size={36} className="text-gray-200 mx-auto mb-3"/>
          <p className="text-gray-400 text-sm mb-1">
            {filter === 'overdue' ? 'No overdue tasks!' : 'No tasks found'}
          </p>
          <Link href="/projects" className="text-sm text-violet-600 hover:underline">Create a project to add tasks</Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {filtered.map(task => (
            <Link key={task.id} href={`/projects/${task.project.id}`}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors group">
              <div className="shrink-0">{STATUS_ICON[task.status] ?? STATUS_ICON.TODO}</div>
              <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-medium truncate group-hover:text-violet-700 transition-colors ${task.status === 'DONE' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                  {task.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="flex items-center gap-1 text-[10px] text-gray-400">
                    <FolderKanban size={9}/> {task.project.name}
                  </span>
                  {task.dueDate && (
                    <span className={`text-[10px] font-medium ${isOverdue(task.dueDate) && task.status !== 'DONE' ? 'text-rose-500' : 'text-gray-400'}`}>
                      Due {new Date(task.dueDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.MEDIUM}`}>
                {task.priority}
              </span>
            </Link>
          ))}
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 text-sm text-violet-700">
          <strong>Get started:</strong> Create a project first, then add tasks with due dates, priority, and assignees.
          <Link href="/projects" className="ml-2 underline font-medium">Go to Projects →</Link>
        </div>
      )}
    </div>
  )
}
