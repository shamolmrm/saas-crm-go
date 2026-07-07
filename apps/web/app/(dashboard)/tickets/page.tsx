'use client'

import { useState }  from 'react'
import Link           from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api }       from '@/lib/api'
import { Plus, Ticket, AlertCircle, Clock, Filter, X } from 'lucide-react'

type TicketStatus   = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED'
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

interface TicketItem {
  id: string; number: number; subject: string; status: TicketStatus; priority: TicketPriority
  slaBreachAt?: string; createdAt: string
  contact:  { id: string; name: string; email?: string } | null
  category: { id: string; name: string; color: string } | null
  assignee: { id: string; name: string } | null
  _count:   { comments: number }
}

interface Category { id: string; name: string; color: string }
interface Contact  { id: string; name: string }

const ticketsApi = {
  list:       (status?: string) => api.get<{ tickets: TicketItem[]; total: number }>('/tickets', { params: status ? { status } : {} }),
  categories: () => api.get<Category[]>('/tickets/categories'),
  contacts:   () => api.get<{ contacts: Contact[] }>('/contacts'),
  create:     (d: object) => api.post<TicketItem>('/tickets', d),
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In Progress', WAITING_CUSTOMER: 'Waiting', RESOLVED: 'Resolved', CLOSED: 'Closed',
}
const PRIORITY_COLOR: Record<TicketPriority, string> = {
  LOW:    'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH:   'bg-amber-100 text-amber-700',
  URGENT: 'bg-red-100 text-red-600',
}
const STATUS_COLOR: Record<TicketStatus, string> = {
  OPEN:             'bg-blue-100 text-blue-700',
  IN_PROGRESS:      'bg-amber-100 text-amber-700',
  WAITING_CUSTOMER: 'bg-purple-100 text-purple-700',
  RESOLVED:         'bg-green-100 text-green-700',
  CLOSED:           'bg-gray-100 text-gray-500',
}

const STATUS_TABS = Object.keys(STATUS_LABELS) as TicketStatus[]

export default function TicketsPage() {
  const qc = useQueryClient()
  const [tab, setTab]         = useState<TicketStatus>('OPEN')
  const [showNew, setShowNew] = useState(false)
  const [form, setForm]       = useState({ subject: '', priority: 'MEDIUM' as TicketPriority, contactId: '', categoryId: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', tab],
    queryFn:  () => ticketsApi.list(tab).then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['ticket-categories'],
    queryFn:  () => ticketsApi.categories().then(r => r.data),
  })

  const { data: contactsData } = useQuery({
    queryKey: ['contacts-for-tickets'],
    queryFn:  () => ticketsApi.contacts().then(r => r.data),
  })
  const contacts = contactsData?.contacts ?? []

  const createMut = useMutation({
    mutationFn: () => ticketsApi.create({
      ...form,
      contactId:  form.contactId  || undefined,
      categoryId: form.categoryId || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      setShowNew(false)
      setForm({ subject: '', priority: 'MEDIUM', contactId: '', categoryId: '' })
    },
  })

  const tickets = data?.tickets ?? []

  const isBreached = (sla?: string) => sla && new Date(sla) < new Date()

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Ticket size={20} /> Helpdesk</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track and resolve customer issues</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium"
        ><Plus size={14} /> New ticket</button>
      </div>

      {/* Status tabs */}
      <div className="flex border-b mb-4 overflow-x-auto">
        {STATUS_TABS.map(s => (
          <button key={s} onClick={() => setTab(s)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === s ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >{STATUS_LABELS[s]}</button>
        ))}
      </div>

      {/* Ticket list */}
      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : tickets.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <Ticket size={32} className="text-muted-foreground mx-auto mb-3" />
          <h2 className="font-medium mb-1">No {STATUS_LABELS[tab].toLowerCase()} tickets</h2>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map(t => (
            <Link key={t.id} href={`/tickets/${t.id}`}
              className="block border rounded-lg px-5 py-4 hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground font-mono">#{t.number}</span>
                    <span className="font-medium text-sm truncate">{t.subject}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_COLOR[t.priority]}`}>{t.priority}</span>
                    {t.category && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: t.category.color + '20', color: t.category.color }}>{t.category.name}</span>
                    )}
                    {t.contact && <span className="text-xs text-muted-foreground">{t.contact.name}</span>}
                    {t.assignee && <span className="text-xs text-muted-foreground">→ {t.assignee.name}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  {t.slaBreachAt && isBreached(t.slaBreachAt) && (
                    <div className="flex items-center gap-1 text-red-600 text-xs"><AlertCircle size={11} /> SLA breached</div>
                  )}
                  {t.slaBreachAt && !isBreached(t.slaBreachAt) && (
                    <div className="flex items-center gap-1 text-muted-foreground text-xs">
                      <Clock size={11} /> due {new Date(t.slaBreachAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">{t._count.comments} replies</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* New ticket modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">New ticket</h2>
              <button onClick={() => setShowNew(false)}><X size={16} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Subject *</label>
                <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="Brief description of the issue"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Priority</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as TicketPriority }))}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none"
                  >
                    {(['LOW','MEDIUM','HIGH','URGENT'] as TicketPriority[]).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Category</label>
                  <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">— none —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Contact</label>
                <select value={form.contactId} onChange={e => setForm(f => ({ ...f, contactId: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="">— none —</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowNew(false)} className="border rounded-md px-3 py-2 text-sm hover:bg-muted">Cancel</button>
              <button
                onClick={() => createMut.mutate()}
                disabled={!form.subject.trim() || createMut.isPending}
                className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
              >{createMut.isPending ? 'Creating…' : 'Create ticket'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
