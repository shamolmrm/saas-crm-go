'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams }  from 'next/navigation'
import Link           from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api }        from '@/lib/api'
import { ArrowLeft, Send, StickyNote, User, AlertCircle, Clock, Tag, UserCheck } from 'lucide-react'

type TicketStatus   = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED'
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

interface Comment {
  id: string; body: string; isInternalNote: boolean; createdAt: string
  author: { id: string; name: string } | null
}

interface Ticket {
  id: string; number: number; subject: string; status: TicketStatus; priority: TicketPriority
  slaBreachAt?: string; createdAt: string; updatedAt: string
  contact:      { id: string; name: string; email?: string; phone?: string } | null
  conversation: { id: string; externalId: string; channelAccount: { channel: string; name: string } } | null
  callRecord:   { id: string; fromNumber: string; durationSeconds?: number } | null
  category:     { id: string; name: string; color: string } | null
  assignee:     { id: string; name: string } | null
  comments:     Comment[]
}

const ticketApi = {
  get:      (id: string) => api.get<Ticket>(`/tickets/${id}`),
  comments: (id: string) => api.get<Comment[]>(`/tickets/${id}/comments?includeNotes=true`),
  comment:  (id: string, body: string, isInternalNote: boolean) =>
    api.post<Comment>(`/tickets/${id}/comments`, { body, isInternalNote }),
  update:   (id: string, data: object) => api.patch(`/tickets/${id}`, data),
}

const STATUS_OPTIONS: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']
const PRIORITY_OPTIONS: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const PRIORITY_COLOR: Record<TicketPriority, string> = {
  LOW: 'text-gray-500', MEDIUM: 'text-blue-600', HIGH: 'text-amber-600', URGENT: 'text-red-600',
}

export default function TicketDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const qc       = useQueryClient()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [reply, setReply]     = useState('')
  const [isNote, setIsNote]   = useState(false)

  const { data: ticket } = useQuery({
    queryKey: ['ticket', id],
    queryFn:  () => ticketApi.get(id).then(r => r.data),
  })

  const { data: comments = [] } = useQuery({
    queryKey: ['ticket-comments', id],
    queryFn:  () => ticketApi.comments(id).then(r => r.data),
    refetchInterval: 15000,
  })

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [comments.length])

  const commentMut = useMutation({
    mutationFn: () => ticketApi.comment(id, reply.trim(), isNote),
    onSuccess:  () => { setReply(''); qc.invalidateQueries({ queryKey: ['ticket-comments', id] }); qc.invalidateQueries({ queryKey: ['tickets'] }) },
  })

  const updateMut = useMutation({
    mutationFn: (data: object) => ticketApi.update(id, data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['ticket', id] }),
  })

  if (!ticket) return <div className="p-8 text-muted-foreground">Loading…</div>

  const isBreached = ticket.slaBreachAt && new Date(ticket.slaBreachAt) < new Date()

  return (
    <div className="flex h-full">
      {/* Thread */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b px-5 py-3 flex items-center gap-3 shrink-0">
          <Link href="/tickets" className="text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /></Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono">#{ticket.number}</span>
              <span className="font-semibold truncate">{ticket.subject}</span>
            </div>
          </div>
          <select value={ticket.status} onChange={e => updateMut.mutate({ status: e.target.value })}
            className="border rounded-md px-2 py-1.5 text-xs font-medium focus:outline-none bg-background"
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>

        {/* Comments */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
          {comments.map(c => (
            <div key={c.id} className={`rounded-xl p-4 text-sm ${c.isInternalNote ? 'bg-amber-50 border border-amber-200' : 'bg-muted/30 border'}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                  {c.author?.name.charAt(0).toUpperCase() ?? '?'}
                </div>
                <span className="font-medium text-xs">{c.author?.name ?? 'Agent'}</span>
                {c.isInternalNote && (
                  <span className="text-xs font-medium text-amber-700 flex items-center gap-1"><StickyNote size={10} /> Internal note</span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">{new Date(c.createdAt).toLocaleString()}</span>
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Reply box */}
        {ticket.status !== 'CLOSED' && (
          <div className="border-t px-4 py-3 bg-background shrink-0">
            <div className={`border rounded-xl ${isNote ? 'border-amber-300 bg-amber-50/20' : 'border-border'}`}>
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && reply.trim()) commentMut.mutate() }}
                placeholder={isNote ? 'Internal note (never sent to customer)…' : 'Reply to customer… (Ctrl+Enter to send)'}
                rows={3}
                className="w-full px-4 pt-3 pb-1 text-sm resize-none focus:outline-none bg-transparent"
              />
              <div className="flex items-center justify-between px-4 pb-3">
                <button onClick={() => setIsNote(n => !n)}
                  className={`flex items-center gap-1 text-xs rounded-md px-2.5 py-1 transition-colors ${isNote ? 'bg-amber-200 text-amber-800' : 'text-muted-foreground hover:bg-muted'}`}
                ><StickyNote size={10} /> {isNote ? 'Note mode' : 'Note'}</button>
                <button onClick={() => commentMut.mutate()} disabled={!reply.trim() || commentMut.isPending}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                ><Send size={13} /> {commentMut.isPending ? '…' : isNote ? 'Save' : 'Reply'}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right sidebar */}
      <div className="w-60 border-l flex flex-col shrink-0 bg-muted/20 p-4 gap-5 overflow-auto">
        {/* SLA */}
        {ticket.slaBreachAt && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">SLA</p>
            <div className={`flex items-center gap-1 text-xs font-medium ${isBreached ? 'text-red-600' : 'text-muted-foreground'}`}>
              {isBreached ? <AlertCircle size={12} /> : <Clock size={12} />}
              {isBreached ? 'Breached' : `Due ${new Date(ticket.slaBreachAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </div>
          </div>
        )}

        {/* Priority */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Priority</p>
          <select value={ticket.priority} onChange={e => updateMut.mutate({ priority: e.target.value })}
            className="w-full border rounded-md px-2 py-1 text-xs focus:outline-none bg-background"
          >
            {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Contact */}
        {ticket.contact && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Contact</p>
            <Link href={`/contacts/${ticket.contact.id}`} className="flex items-center gap-1.5 text-sm hover:text-primary">
              <User size={12} /> {ticket.contact.name}
            </Link>
            {ticket.contact.email && <p className="text-xs text-muted-foreground mt-0.5">{ticket.contact.email}</p>}
          </div>
        )}

        {/* Category */}
        {ticket.category && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Category</p>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: ticket.category.color + '20', color: ticket.category.color }}>
              {ticket.category.name}
            </span>
          </div>
        )}

        {/* Assignee */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Assignee</p>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <UserCheck size={12} /> {ticket.assignee?.name ?? 'Unassigned'}
          </div>
        </div>

        {/* Source links */}
        {ticket.conversation && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Source</p>
            <Link href={`/inbox/${ticket.conversation.id}`} className="text-xs text-primary hover:underline">
              {ticket.conversation.channelAccount.channel} conversation
            </Link>
          </div>
        )}

        <div className="text-xs text-muted-foreground border-t pt-3">
          Created {new Date(ticket.createdAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  )
}
