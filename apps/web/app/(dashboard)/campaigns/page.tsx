'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Megaphone, Plus, Send, Trash2, Eye, CheckCircle2, X, Users, Mail, MessageSquare, Clock, AlertCircle } from 'lucide-react'

interface Campaign {
  id: string; name: string; channel: string; subject?: string; body: string
  filter: { company?: string; hasEmail?: boolean; hasPhone?: boolean }
  status: string; totalContacts: number; totalSent: number; totalFailed: number
  sentAt?: string; createdAt: string
}
interface Preview { total: number; sample: { id: string; name: string; email?: string; phone?: string; company?: string }[] }

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  DRAFT:   { label: 'Draft',   cls: 'bg-gray-100 text-gray-500'     },
  SENDING: { label: 'Sending', cls: 'bg-amber-100 text-amber-600'   },
  SENT:    { label: 'Sent',    cls: 'bg-emerald-100 text-emerald-600'},
  FAILED:  { label: 'Failed',  cls: 'bg-rose-100 text-rose-600'     },
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading,   setLoading]   = useState(true)
  const [composing, setComposing] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [sending,   setSending]   = useState(false)
  const [preview,   setPreview]   = useState<Preview | null>(null)
  const [previewId, setPreviewId] = useState('')
  const [detail,    setDetail]    = useState<Campaign | null>(null)

  const [name,    setName]    = useState('')
  const [channel, setChannel] = useState<'email'|'whatsapp'>('email')
  const [subject, setSubject] = useState('')
  const [body,    setBody]    = useState('')
  const [company, setCompany] = useState('')
  const [reqEmail,setReqEmail]= useState(true)
  const [reqPhone,setReqPhone]= useState(false)

  useEffect(() => { load() }, [])
  async function load() { setLoading(true); try { const r = await api.get<Campaign[]>('/campaigns'); setCampaigns(r.data) } finally { setLoading(false) } }

  async function save() {
    if (!name.trim() || !body.trim()) return
    setSaving(true)
    try {
      const r = await api.post<Campaign>('/campaigns', {
        name, channel, subject: channel === 'email' ? subject : undefined, body,
        filter: { company: company || undefined, hasEmail: reqEmail || undefined, hasPhone: reqPhone || undefined },
      })
      setCampaigns(prev => [r.data, ...prev])
      setComposing(false); resetForm()
    } catch (e: any) { alert(e?.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  async function getPreview(id: string) {
    setPreviewId(id)
    const r = await api.post<Preview>(`/campaigns/${id}/preview`, {})
    setPreview(r.data)
  }

  async function sendCampaign(id: string) {
    if (!confirm('Send this campaign to all matching contacts? This cannot be undone.')) return
    setSending(true)
    try {
      await api.post(`/campaigns/${id}/send`, {})
      await load()
    } catch (e: any) { alert(e?.response?.data?.error ?? 'Send failed') }
    finally { setSending(false); setPreview(null); setPreviewId('') }
  }

  async function deleteCampaign(id: string) {
    if (!confirm('Delete this campaign?')) return
    await api.delete(`/campaigns/${id}`); load()
  }

  function resetForm() { setName(''); setChannel('email'); setSubject(''); setBody(''); setCompany(''); setReqEmail(true); setReqPhone(false) }

  // ── Detail view ────────────────────────────────────────────────────────────
  if (detail) return (
    <div className="p-6 max-w-2xl mx-auto">
      <button onClick={() => setDetail(null)} className="text-sm text-gray-500 hover:text-gray-800 mb-4 flex items-center gap-1">← Back</button>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900">{detail.name}</h2>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[detail.status].cls}`}>{STATUS_BADGE[detail.status].label}</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[['Total', detail.totalContacts],['Sent', detail.totalSent],['Failed', detail.totalFailed]].map(([l, v]) => (
            <div key={l as string} className="text-center bg-gray-50 rounded-xl py-3">
              <div className="text-2xl font-bold text-gray-900">{v}</div>
              <div className="text-[11px] text-gray-400">{l}</div>
            </div>
          ))}
        </div>
        <div>
          <p className="text-[11px] text-gray-400 mb-1 font-medium uppercase">Message</p>
          <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-wrap">{detail.body}</div>
        </div>
        {detail.sentAt && <p className="text-[11px] text-gray-400">Sent at {new Date(detail.sentAt).toLocaleString()}</p>}
      </div>
    </div>
  )

  // ── Composer ────────────────────────────────────────────────────────────────
  if (composing) return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-900">New Campaign</h2>
        <button onClick={() => { setComposing(false); resetForm() }}><X size={18} className="text-gray-400"/></button>
      </div>

      <div className="space-y-4">
        {/* Channel select */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Campaign name *"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200"/>
          <div className="flex gap-3">
            {(['email','whatsapp'] as const).map(ch => (
              <button key={ch} onClick={() => setChannel(ch)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${channel === ch ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}>
                {ch === 'email' ? <Mail size={15}/> : <MessageSquare size={15}/>}
                {ch === 'email' ? 'Email' : 'WhatsApp'}
              </button>
            ))}
          </div>
          {channel === 'email' && (
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject line"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200"/>
          )}
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={5}
            placeholder={`Message body…\n\nTip: use {name} to personalize with contact's name`}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200 resize-none"/>
        </div>

        {/* Audience filter */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <h3 className="font-semibold text-gray-800 text-sm">Audience Filter</h3>
          <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Filter by company name (optional — leave blank for all)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200"/>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={reqEmail} onChange={e => setReqEmail(e.target.checked)} className="accent-violet-600"/>
              Must have email
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={reqPhone} onChange={e => setReqPhone(e.target.checked)} className="accent-violet-600"/>
              Must have phone
            </label>
          </div>
          <p className="text-[11px] text-gray-400">Leave both unchecked to target all contacts matching the channel.</p>
        </div>

        <div className="flex gap-3">
          <button onClick={() => { setComposing(false); resetForm() }} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={!name.trim() || !body.trim() || saving}
            className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <CheckCircle2 size={15}/>}
            Save Campaign
          </button>
        </div>
      </div>
    </div>
  )

  // ── List ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Megaphone size={20} className="text-rose-500"/> Campaigns</h1>
          <p className="text-sm text-gray-400 mt-0.5">Send bulk messages to your CRM contacts via Email or WhatsApp</p>
        </div>
        <button onClick={() => setComposing(true)} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          <Plus size={14}/> New Campaign
        </button>
      </div>

      {/* WhatsApp notice */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
        <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5"/>
        <p className="text-[12px] text-amber-700">WhatsApp campaigns use your connected WhatsApp Cloud API. Only send to opted-in contacts in compliance with Meta policies. Email campaigns log messages in the CRM inbox.</p>
      </div>

      {loading ? <div className="text-center py-16 text-gray-400">Loading…</div> : campaigns.length === 0 ? (
        <div className="text-center py-20">
          <Megaphone size={40} className="text-gray-200 mx-auto mb-3"/>
          <p className="text-gray-400 mb-4">No campaigns yet</p>
          <button onClick={() => setComposing(true)} className="bg-violet-600 text-white text-sm font-semibold px-5 py-2 rounded-lg">Create first campaign</button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-violet-200 transition-all">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${c.channel === 'email' ? 'bg-blue-50' : 'bg-emerald-50'}`}>
                  {c.channel === 'email' ? <Mail size={14} className="text-blue-600"/> : <MessageSquare size={14} className="text-emerald-600"/>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-800 truncate">{c.name}</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[c.status].cls}`}>{STATUS_BADGE[c.status].label}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">{c.body.substring(0, 80)}…</p>
                </div>

                {c.status === 'SENT' && (
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-emerald-600 font-medium">✓ {c.totalSent} sent</span>
                      {c.totalFailed > 0 && <span className="text-[11px] text-rose-500 font-medium">✗ {c.totalFailed}</span>}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 shrink-0">
                  {c.status === 'DRAFT' && (
                    <>
                      <button onClick={() => { setPreviewId(c.id); getPreview(c.id) }}
                        className="flex items-center gap-1.5 text-[12px] text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                        <Users size={12}/> Preview
                      </button>
                      <button onClick={() => sendCampaign(c.id)} disabled={sending}
                        className="flex items-center gap-1.5 text-[12px] text-white bg-violet-600 hover:bg-violet-700 rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50">
                        <Send size={12}/> Send
                      </button>
                    </>
                  )}
                  {c.status === 'SENT' && (
                    <button onClick={() => setDetail(c)} className="flex items-center gap-1.5 text-[12px] text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                      <Eye size={12}/> Details
                    </button>
                  )}
                  <button onClick={() => deleteCampaign(c.id)} className="p-1.5 text-gray-300 hover:text-rose-400">
                    <Trash2 size={13}/>
                  </button>
                </div>
              </div>

              {/* Preview panel */}
              {previewId === c.id && preview && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-[12px] font-semibold text-gray-600 mb-2"><Users size={11} className="inline mr-1"/>{preview.total} contacts will receive this</p>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.sample.map(ct => (
                      <span key={ct.id} className="bg-violet-50 text-violet-700 text-[11px] px-2 py-0.5 rounded-full">{ct.name}</span>
                    ))}
                    {preview.total > preview.sample.length && <span className="text-[11px] text-gray-400">+{preview.total - preview.sample.length} more</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
