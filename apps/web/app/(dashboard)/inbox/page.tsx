'use client'

import Link        from 'next/link'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api }     from '@/lib/api'
import { MessageSquare, Mail, Phone, Filter } from 'lucide-react'

type ConvStatus = 'OPEN' | 'RESOLVED' | 'SNOOZED'

interface ChannelAccount { id: string; name: string; channel: 'WHATSAPP' | 'EMAIL' }
interface Conversation {
  id: string; externalId: string; status: ConvStatus; subject: string | null
  lastMessageAt: string | null
  contact: { id: string; name: string; email?: string; phone?: string } | null
  channelAccount: ChannelAccount
  messages: { body: string; direction: string; sentAt: string }[]
  _count: { messages: number }
}

const inboxApi = {
  list:   (status?: string) => api.get<{ conversations: Conversation[]; total: number }>('/inbox/conversations', { params: status ? { status } : {} }),
  update: (id: string, data: object) => api.patch(`/inbox/conversations/${id}`, data),
}

const STATUS_TABS: { label: string; value: ConvStatus | '' }[] = [
  { label: 'Open',     value: 'OPEN' },
  { label: 'Resolved', value: 'RESOLVED' },
  { label: 'Snoozed',  value: 'SNOOZED' },
]

const CHANNEL_ICON = {
  WHATSAPP: <Phone size={12} className="text-green-600" />,
  EMAIL:    <Mail  size={12} className="text-blue-600"  />,
}

export default function InboxPage() {
  const qc = useQueryClient()
  const [status, setStatus] = useState<ConvStatus>('OPEN')

  const { data, isLoading } = useQuery({
    queryKey: ['conversations', status],
    queryFn:  () => inboxApi.list(status).then(r => r.data),
    refetchInterval: 15000,
  })

  const resolveMut = useMutation({
    mutationFn: (id: string) => inboxApi.update(id, { status: 'RESOLVED' }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  })

  const conversations = data?.conversations ?? []

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 border-r flex flex-col shrink-0">
        <div className="p-4 border-b">
          <h1 className="font-semibold text-lg flex items-center gap-2"><MessageSquare size={18} /> Inbox</h1>
        </div>
        <div className="p-2">
          {STATUS_TABS.map(t => (
            <button key={t.value} onClick={() => setStatus(t.value as ConvStatus)}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${status === t.value ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted'}`}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6 text-muted-foreground text-sm">Loading…</div>
        ) : conversations.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare size={32} className="text-muted-foreground mx-auto mb-3" />
            <h2 className="font-medium mb-1">No {status.toLowerCase()} conversations</h2>
            <p className="text-muted-foreground text-sm">Conversations from WhatsApp and Email will appear here.</p>
          </div>
        ) : (
          <div className="divide-y">
            {conversations.map(conv => {
              const lastMsg = conv.messages[0]
              const name    = conv.contact?.name ?? conv.externalId
              return (
                <div key={conv.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <Link href={`/inbox/${conv.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {CHANNEL_ICON[conv.channelAccount.channel]}
                      <span className="font-medium text-sm truncate">{name}</span>
                      {conv.lastMessageAt && (
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">
                          {new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    {conv.subject && <p className="text-xs text-muted-foreground truncate">{conv.subject}</p>}
                    {lastMsg && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {lastMsg.direction === 'OUTBOUND' ? 'You: ' : ''}{lastMsg.body}
                      </p>
                    )}
                  </Link>
                  {status === 'OPEN' && (
                    <button
                      onClick={() => resolveMut.mutate(conv.id)}
                      className="opacity-0 group-hover:opacity-100 text-xs border rounded px-2 py-1 hover:bg-muted shrink-0 transition-opacity"
                    >Resolve</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
