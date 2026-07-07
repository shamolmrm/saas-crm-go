'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter }        from 'next/navigation'
import Link                            from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api }   from '@/lib/api'
import { ArrowLeft, Send, StickyNote, Phone, Mail, User, CheckCircle2 } from 'lucide-react'

interface ChannelAccount { id: string; name: string; channel: 'WHATSAPP' | 'EMAIL' }
interface Contact        { id: string; name: string; email?: string; phone?: string }
interface Message {
  id: string; body: string; direction: 'INBOUND' | 'OUTBOUND'
  isInternalNote: boolean; sentAt: string; sentById?: string
}
interface Conversation {
  id: string; externalId: string; status: string; subject?: string
  lastMessageAt?: string; contactId?: string
  contact: Contact | null
  channelAccount: ChannelAccount
  messages: Message[]
}

const inboxApi = {
  get:      (id: string) => api.get<Conversation>(`/inbox/conversations/${id}`),
  messages: (id: string) => api.get<Message[]>(`/inbox/conversations/${id}/messages`),
  send:     (id: string, body: string, isInternalNote: boolean) =>
    api.post<Message>(`/inbox/conversations/${id}/messages`, { body, isInternalNote }),
  update:   (id: string, data: object) => api.patch(`/inbox/conversations/${id}`, data),
}

const CHANNEL_ICON = {
  WHATSAPP: <Phone size={14} className="text-green-600" />,
  EMAIL:    <Mail  size={14} className="text-blue-600"  />,
}

export default function ConversationPage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()
  const qc       = useQueryClient()
  const bottomRef = useRef<HTMLDivElement>(null)

  const [replyText, setReplyText]       = useState('')
  const [isNote, setIsNote]             = useState(false)

  const { data: conv, isLoading } = useQuery({
    queryKey: ['conversation', id],
    queryFn:  () => inboxApi.get(id).then(r => r.data),
  })

  const { data: messages = [] } = useQuery({
    queryKey: ['messages', id],
    queryFn:  () => inboxApi.messages(id).then(r => r.data),
    refetchInterval: 8000,
  })

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const sendMut = useMutation({
    mutationFn: () => inboxApi.send(id, replyText.trim(), isNote),
    onSuccess:  () => {
      setReplyText('')
      qc.invalidateQueries({ queryKey: ['messages', id] })
      qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  const resolveMut = useMutation({
    mutationFn: () => inboxApi.update(id, { status: 'RESOLVED' }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['conversation', id] })
      qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  const handleSend = () => {
    if (!replyText.trim() || sendMut.isPending) return
    sendMut.mutate()
  }

  if (isLoading) {
    return <div className="p-8 text-muted-foreground text-sm">Loading…</div>
  }
  if (!conv) {
    return <div className="p-8 text-muted-foreground text-sm">Conversation not found.</div>
  }

  const displayName = conv.contact?.name ?? conv.externalId
  const isResolved  = conv.status === 'RESOLVED'

  return (
    <div className="flex h-full">
      {/* Thread */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="border-b px-5 py-3 flex items-center gap-3 bg-background shrink-0">
          <Link href="/inbox" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} />
          </Link>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {CHANNEL_ICON[conv.channelAccount.channel]}
            <span className="font-semibold truncate">{displayName}</span>
            <span className="text-xs text-muted-foreground">{conv.externalId}</span>
            {conv.subject && (
              <span className="text-sm text-muted-foreground truncate">— {conv.subject}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              isResolved ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
            }`}>{conv.status}</span>
            {!isResolved && (
              <button
                onClick={() => resolveMut.mutate()}
                disabled={resolveMut.isPending}
                className="flex items-center gap-1.5 border rounded-md px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
              >
                <CheckCircle2 size={14} /> Resolve
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-8">No messages yet.</p>
          )}
          {messages.map(msg => {
            const isOut  = msg.direction === 'OUTBOUND'
            const isNote = msg.isInternalNote
            return (
              <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
                  isNote
                    ? 'bg-amber-50 border border-amber-200 text-amber-900'
                    : isOut
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}>
                  {isNote && (
                    <p className="text-xs font-semibold text-amber-700 mb-1 flex items-center gap-1">
                      <StickyNote size={11} /> Internal note
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                  <p className={`text-xs mt-1 ${isOut && !isNote ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Reply box */}
        {!isResolved && (
          <div className="border-t px-4 py-3 bg-background shrink-0">
            <div className={`border rounded-xl ${isNote ? 'border-amber-300 bg-amber-50/30' : 'border-border'}`}>
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend() }}
                placeholder={isNote ? 'Add an internal note (not visible to customer)…' : 'Type a reply… (Ctrl+Enter to send)'}
                rows={3}
                className="w-full px-4 pt-3 pb-1 text-sm resize-none focus:outline-none bg-transparent"
              />
              <div className="flex items-center justify-between px-4 pb-3">
                <button
                  type="button"
                  onClick={() => setIsNote(n => !n)}
                  className={`flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1 transition-colors ${
                    isNote ? 'bg-amber-200 text-amber-800' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <StickyNote size={11} /> {isNote ? 'Note mode on' : 'Add note'}
                </button>
                <button
                  onClick={handleSend}
                  disabled={!replyText.trim() || sendMut.isPending}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                >
                  <Send size={13} /> {sendMut.isPending ? 'Sending…' : isNote ? 'Save note' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right sidebar — contact info */}
      <div className="w-60 border-l flex flex-col shrink-0 bg-muted/20 p-4 gap-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contact</p>
          {conv.contact ? (
            <Link href={`/contacts/${conv.contact.id}`} className="block hover:bg-muted rounded-lg p-2 -mx-2 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                  {conv.contact.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{conv.contact.name}</p>
                  {conv.contact.email && <p className="text-xs text-muted-foreground truncate">{conv.contact.email}</p>}
                </div>
              </div>
            </Link>
          ) : (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <User size={14} />
              <span className="truncate">{conv.externalId}</span>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Channel</p>
          <div className="flex items-center gap-2 text-sm">
            {CHANNEL_ICON[conv.channelAccount.channel]}
            <span>{conv.channelAccount.name}</span>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Via</p>
          <p className="text-sm text-muted-foreground">{conv.externalId}</p>
        </div>
      </div>
    </div>
  )
}
