'use client'

import { useState }  from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api }       from '@/lib/api'
import { Phone, PhoneCall, PhoneOff, Clock, User, FileText, Plus, X, AlertTriangle } from 'lucide-react'

interface CallRecord {
  id: string; direction: 'INBOUND' | 'OUTBOUND'; status: string
  fromNumber: string; toNumber: string; consentGiven: boolean
  durationSeconds?: number; startedAt: string; endedAt?: string
  summary?: string; transcript?: string
  contact: { id: string; name: string } | null
  callScript: { id: string; name: string } | null
}

interface CallScript {
  id: string; name: string; isActive: boolean; createdAt: string
  _count: { callRecords: number }
}

interface Contact { id: string; name: string; phone?: string }

const voiceApi = {
  calls:        () => api.get<CallRecord[]>('/voice/calls'),
  callDetail:   (id: string) => api.get<CallRecord & { transcript?: string }>(`/voice/calls/${id}`),
  scripts:      () => api.get<CallScript[]>('/voice/scripts'),
  outbound:     (d: object) => api.post('/voice/calls/outbound', d),
  contacts:     () => api.get<{ contacts: Contact[] }>('/contacts'),
}

const STATUS_COLOR: Record<string, string> = {
  INITIATED:   'bg-blue-50 text-blue-600',
  RINGING:     'bg-amber-50 text-amber-600',
  IN_PROGRESS: 'bg-green-50 text-green-700',
  COMPLETED:   'bg-gray-100 text-gray-600',
  FAILED:      'bg-red-50 text-red-600',
  NO_ANSWER:   'bg-muted text-muted-foreground',
  VOICEMAIL:   'bg-purple-50 text-purple-600',
}

function formatDuration(seconds?: number) {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function VoicePage() {
  const qc = useQueryClient()
  const [showDial, setShowDial] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [consentChecked, setConsentChecked] = useState(false)
  const [dialForm, setDialForm] = useState({ toNumber: '', contactId: '', callScriptId: '' })
  const [dialError, setDialError] = useState('')

  const { data: calls = [] } = useQuery({
    queryKey: ['voice-calls'],
    queryFn:  () => voiceApi.calls().then(r => r.data),
    refetchInterval: 10000,
  })

  const { data: scripts = [] } = useQuery({
    queryKey: ['call-scripts'],
    queryFn:  () => voiceApi.scripts().then(r => r.data),
  })

  const { data: contactsData } = useQuery({
    queryKey: ['contacts-for-voice'],
    queryFn:  () => voiceApi.contacts().then(r => r.data),
  })
  const contacts = contactsData?.contacts ?? []

  const { data: detail } = useQuery({
    queryKey: ['call-detail', selected],
    queryFn:  () => selected ? voiceApi.callDetail(selected).then(r => r.data) : null,
    enabled:  !!selected,
  })

  const outboundMut = useMutation({
    mutationFn: () => voiceApi.outbound({
      toNumber:     dialForm.toNumber,
      contactId:    dialForm.contactId || undefined,
      callScriptId: dialForm.callScriptId || undefined,
      consentGiven: true,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voice-calls'] })
      setShowDial(false)
      setConsentChecked(false)
      setDialForm({ toNumber: '', contactId: '', callScriptId: '' })
      setDialError('')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Call failed'
      setDialError(msg)
    },
  })

  return (
    <div className="flex h-full">
      {/* Call list */}
      <div className="flex-1 flex flex-col">
        <div className="border-b px-6 py-4 flex items-center gap-4 shrink-0">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><Phone size={18} /> Voice AI</h1>
            <p className="text-muted-foreground text-xs mt-0.5">AI-assisted calls powered by Vapi</p>
          </div>
          <button onClick={() => setShowDial(true)}
            className="ml-auto flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium"
          ><PhoneCall size={14} /> New call</button>
        </div>

        <div className="flex-1 overflow-auto">
          {calls.length === 0 ? (
            <div className="p-12 text-center">
              <Phone size={32} className="text-muted-foreground mx-auto mb-3" />
              <h2 className="font-medium mb-1">No calls yet</h2>
              <p className="text-muted-foreground text-sm">Initiate your first AI call above. Requires Vapi API key in .env</p>
            </div>
          ) : (
            <div className="divide-y">
              {calls.map(call => (
                <button key={call.id} onClick={() => setSelected(call.id)}
                  className={`w-full text-left px-5 py-3 hover:bg-muted/30 transition-colors flex items-center gap-3 ${selected === call.id ? 'bg-primary/5' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${call.direction === 'INBOUND' ? 'bg-green-100' : 'bg-blue-100'}`}>
                    {call.direction === 'INBOUND' ? <Phone size={14} className="text-green-600" /> : <PhoneCall size={14} className="text-blue-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{call.contact?.name ?? (call.direction === 'OUTBOUND' ? call.toNumber : call.fromNumber)}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[call.status]}`}>{call.status.replace('_', ' ').toLowerCase()}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1"><Clock size={10} /> {formatDuration(call.durationSeconds)}</span>
                      <span>{new Date(call.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      {call.callScript && <span className="flex items-center gap-1"><FileText size={10} /> {call.callScript.name}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && detail && (
        <div className="w-80 border-l flex flex-col shrink-0">
          <div className="border-b px-4 py-3 flex items-center justify-between">
            <p className="font-semibold text-sm">Call detail</p>
            <button onClick={() => setSelected(null)}><X size={14} className="text-muted-foreground" /></button>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-4">
            <div className="space-y-1.5 text-sm">
              {detail.contact && (
                <div className="flex items-center gap-2 text-muted-foreground"><User size={12} /> {detail.contact.name}</div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone size={12} /> {detail.direction === 'OUTBOUND' ? detail.toNumber : detail.fromNumber}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock size={12} /> {formatDuration(detail.durationSeconds)}
              </div>
              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[detail.status]}`}>
                {detail.status.replace('_', ' ').toLowerCase()}
              </span>
            </div>

            {detail.summary && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">AI Summary</p>
                <p className="text-sm text-muted-foreground">{detail.summary}</p>
              </div>
            )}

            {detail.transcript && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Transcript</p>
                <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap max-h-64 overflow-auto">{detail.transcript}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Outbound dial modal */}
      {showDial && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Make outbound AI call</h2>
              <button onClick={() => { setShowDial(false); setDialError('') }}><X size={16} className="text-muted-foreground" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Phone number *</label>
                <input value={dialForm.toNumber} onChange={e => setDialForm(f => ({ ...f, toNumber: e.target.value }))}
                  placeholder="+8801234567890"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Contact (optional)</label>
                <select value={dialForm.contactId} onChange={e => {
                  const c = contacts.find(c => c.id === e.target.value)
                  setDialForm(f => ({ ...f, contactId: e.target.value, toNumber: f.toNumber || c?.phone || '' }))
                }} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none">
                  <option value="">— none —</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Call script (optional)</label>
                <select value={dialForm.callScriptId} onChange={e => setDialForm(f => ({ ...f, callScriptId: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="">— use default assistant —</option>
                  {scripts.filter(s => s.isActive).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Consent gate — required by law for outbound AI calls */}
              <div className="border border-amber-300 bg-amber-50 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800">Consent required</p>
                    <p className="text-xs text-amber-700 mt-0.5">Outbound AI calls require explicit prior consent from the recipient. Do not call without consent.</p>
                  </div>
                </div>
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} className="rounded" />
                  <span className="text-xs text-amber-800 font-medium">I confirm the recipient has given explicit consent to receive this AI call</span>
                </label>
              </div>

              {dialError && <p className="text-destructive text-xs">{dialError}</p>}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setShowDial(false); setDialError('') }} className="border rounded-md px-3 py-2 text-sm hover:bg-muted">Cancel</button>
              <button
                onClick={() => outboundMut.mutate()}
                disabled={!dialForm.toNumber || !consentChecked || outboundMut.isPending}
                className="flex items-center gap-1.5 bg-green-600 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-green-700"
              ><PhoneCall size={13} /> {outboundMut.isPending ? 'Dialling…' : 'Call now'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
