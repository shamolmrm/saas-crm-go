'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { FileText, Plus, Trash2, Copy, ExternalLink, Eye, ToggleLeft, ToggleRight, X, GripVertical, CheckCircle2, Users } from 'lucide-react'

interface FormField { id: string; type: string; label: string; placeholder?: string; required: boolean; options?: string[] }
interface CRMForm   { id: string; title: string; description?: string; slug: string; fields: FormField[]; isActive: boolean; createContact: boolean; _count: { submissions: number } }

const FIELD_TYPES = [
  { value: 'text',     label: 'Text' },
  { value: 'email',    label: 'Email' },
  { value: 'tel',      label: 'Phone' },
  { value: 'number',   label: 'Number' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'select',   label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'url',      label: 'URL' },
]

const DEFAULT_FIELDS: FormField[] = [
  { id: 'name',    type: 'text',  label: 'Full Name',     required: true  },
  { id: 'email',   type: 'email', label: 'Email Address', required: true  },
  { id: 'phone',   type: 'tel',   label: 'Phone Number',  required: false },
  { id: 'message', type: 'textarea', label: 'Message',    required: false },
]

export default function FormsPage() {
  const [forms,    setForms]    = useState<CRMForm[]>([])
  const [loading,  setLoading]  = useState(true)
  const [building, setBuilding] = useState(false)
  const [editing,  setEditing]  = useState<CRMForm | null>(null)
  const [copied,   setCopied]   = useState('')

  // Builder state
  const [title,    setTitle]    = useState('')
  const [desc,     setDesc]     = useState('')
  const [fields,   setFields]   = useState<FormField[]>(DEFAULT_FIELDS)
  const [createC,  setCreateC]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [viewSubs, setViewSubs] = useState<CRMForm | null>(null)
  const [subs,     setSubs]     = useState<{ id: string; data: Record<string, unknown>; contact?: { name: string; email: string }; createdAt: string }[]>([])

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try { const r = await api.get<CRMForm[]>('/forms'); setForms(r.data) } finally { setLoading(false) }
  }

  async function saveForm() {
    if (!title.trim() || fields.length === 0) return
    setSaving(true)
    try {
      if (editing) {
        await api.patch(`/forms/${editing.id}`, { title, description: desc, fields, createContact: createC })
      } else {
        await api.post('/forms', { title, description: desc, fields, createContact: createC })
      }
      setBuilding(false); setEditing(null); resetForm(); load()
    } catch (e: any) { alert(e?.response?.data?.error ?? 'Error saving form') }
    finally { setSaving(false) }
  }

  async function deleteForm(id: string) {
    if (!confirm('Delete this form and all submissions?')) return
    await api.delete(`/forms/${id}`); load()
  }

  async function toggleActive(f: CRMForm) {
    await api.patch(`/forms/${f.id}`, { isActive: !f.isActive }); load()
  }

  async function loadSubs(f: CRMForm) {
    const r = await api.get<CRMForm & { submissions: typeof subs }>(`/forms/${f.id}`)
    setViewSubs(r.data); setSubs(r.data.submissions)
  }

  function openEdit(f: CRMForm) {
    setEditing(f); setTitle(f.title); setDesc(f.description ?? ''); setFields(f.fields); setCreateC(f.createContact)
    setBuilding(true)
  }

  function resetForm() { setTitle(''); setDesc(''); setFields(DEFAULT_FIELDS); setCreateC(true); setEditing(null) }

  function addField() {
    setFields(prev => [...prev, { id: `field_${Date.now()}`, type: 'text', label: 'New Field', required: false }])
  }

  function updateField(idx: number, key: string, val: unknown) {
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, [key]: val } : f))
  }

  function removeField(idx: number) { setFields(prev => prev.filter((_, i) => i !== idx)) }

  function copyLink(slug: string) {
    const link = `${baseUrl}/f/${slug}`
    navigator.clipboard.writeText(link).then(() => { setCopied(slug); setTimeout(() => setCopied(''), 2000) })
  }

  const publicLink = (slug: string) => `${baseUrl}/f/${slug}`

  // ── View submissions panel ─────────────────────────────────────────────────
  if (viewSubs) return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => setViewSubs(null)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4">
        ← Back to Forms
      </button>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-gray-900">{viewSubs.title} — Submissions</h2>
        <span className="text-sm text-gray-400">{subs.length} total</span>
      </div>
      {subs.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-100">No submissions yet — share the form link to collect responses.</div>
      ) : (
        <div className="space-y-3">
          {subs.map(s => (
            <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {s.contact && <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><Users size={10}/> Contact created</span>}
                  <span className="text-[11px] text-gray-400">{new Date(s.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(s.data).map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg px-3 py-1.5">
                    <p className="text-[10px] text-gray-400 font-medium capitalize">{k}</p>
                    <p className="text-[12px] text-gray-800 truncate">{String(v)}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ── Form builder ───────────────────────────────────────────────────────────
  if (building) return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-900">{editing ? 'Edit Form' : 'Build New Form'}</h2>
        <button onClick={() => { setBuilding(false); resetForm() }} className="text-gray-400 hover:text-gray-700"><X size={18}/></button>
      </div>

      <div className="space-y-5">
        {/* Meta */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Form title *"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"/>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (optional)" rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 resize-none"/>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={createC} onChange={e => setCreateC(e.target.checked)} className="accent-violet-600"/>
            Auto-create CRM contact on each submission
          </label>
        </div>

        {/* Fields */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 text-sm">Form Fields</h3>
            <button onClick={addField}
              className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 font-medium">
              <Plus size={13}/> Add Field
            </button>
          </div>
          <div className="space-y-3">
            {fields.map((f, idx) => (
              <div key={f.id} className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100 group">
                <GripVertical size={14} className="text-gray-300 mt-2 shrink-0"/>
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input value={f.label} onChange={e => updateField(idx, 'label', e.target.value)}
                    placeholder="Field label" className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-violet-200"/>
                  <select value={f.type} onChange={e => updateField(idx, 'type', e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-violet-200">
                    {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input value={f.placeholder ?? ''} onChange={e => updateField(idx, 'placeholder', e.target.value)}
                    placeholder="Placeholder (optional)" className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-violet-200"/>
                  <label className="flex items-center gap-2 text-[12px] text-gray-600">
                    <input type="checkbox" checked={f.required} onChange={e => updateField(idx, 'required', e.target.checked)} className="accent-violet-600"/>
                    Required
                  </label>
                </div>
                <button onClick={() => removeField(idx)} className="text-gray-200 hover:text-rose-400 mt-1.5 transition-colors shrink-0">
                  <X size={14}/>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">Preview</h3>
          <div className="border border-dashed border-gray-200 rounded-xl p-4 space-y-3">
            <h4 className="text-base font-bold text-gray-800">{title || 'Form Title'}</h4>
            {fields.map(f => (
              <div key={f.id}>
                <label className="text-[12px] font-medium text-gray-700 mb-1 block">
                  {f.label}{f.required && <span className="text-rose-500 ml-0.5">*</span>}
                </label>
                {f.type === 'textarea' ? (
                  <textarea disabled placeholder={f.placeholder || f.label} rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] bg-gray-50 resize-none"/>
                ) : f.type === 'select' ? (
                  <select disabled className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] bg-gray-50">
                    <option>{f.placeholder || 'Select…'}</option>
                  </select>
                ) : (
                  <input type={f.type} disabled placeholder={f.placeholder || f.label}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] bg-gray-50"/>
                )}
              </div>
            ))}
            <button disabled className="w-full bg-violet-600 text-white py-2 rounded-lg text-sm font-semibold opacity-60 cursor-default">Submit</button>
          </div>
        </div>

        {/* Save */}
        <div className="flex gap-3">
          <button onClick={() => { setBuilding(false); resetForm() }}
            className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={saveForm} disabled={!title.trim() || saving}
            className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <CheckCircle2 size={15}/>}
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Form'}
          </button>
        </div>
      </div>
    </div>
  )

  // ── Form list ──────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><FileText size={20} className="text-emerald-500"/> Forms</h1>
          <p className="text-sm text-gray-400 mt-0.5">Build forms that auto-create CRM contacts on submission</p>
        </div>
        <button onClick={() => { resetForm(); setBuilding(true) }}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <Plus size={14}/> New Form
        </button>
      </div>

      {loading ? <div className="text-center py-16 text-gray-400">Loading…</div> : forms.length === 0 ? (
        <div className="text-center py-20">
          <FileText size={40} className="text-gray-200 mx-auto mb-3"/>
          <p className="text-gray-400 mb-4">No forms yet</p>
          <button onClick={() => { resetForm(); setBuilding(true) }}
            className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">
            Build your first form
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {forms.map(f => (
            <div key={f.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:border-violet-200 transition-all">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 truncate">{f.title}</h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">{f.fields.length} fields · {f._count.submissions} submissions</p>
                </div>
                <button onClick={() => toggleActive(f)} className="shrink-0">
                  {f.isActive
                    ? <ToggleRight size={20} className="text-emerald-500"/>
                    : <ToggleLeft  size={20} className="text-gray-300"/>}
                </button>
              </div>

              {/* Share link */}
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 mb-3">
                <span className="text-[11px] text-gray-500 flex-1 truncate">/f/{f.slug}</span>
                <button onClick={() => copyLink(f.slug)} className="shrink-0">
                  {copied === f.slug
                    ? <CheckCircle2 size={13} className="text-emerald-500"/>
                    : <Copy size={13} className="text-gray-400 hover:text-violet-600"/>}
                </button>
                <a href={publicLink(f.slug)} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} className="text-gray-400 hover:text-violet-600"/>
                </a>
              </div>

              <div className="flex gap-2">
                <button onClick={() => loadSubs(f)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-[12px] text-gray-600 border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50 transition-colors">
                  <Eye size={12}/> Submissions ({f._count.submissions})
                </button>
                <button onClick={() => openEdit(f)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-[12px] text-violet-600 border border-violet-200 rounded-lg py-1.5 hover:bg-violet-50 transition-colors">
                  Edit
                </button>
                <button onClick={() => deleteForm(f.id)}
                  className="p-1.5 border border-gray-200 rounded-lg text-gray-400 hover:text-rose-500 hover:border-rose-200 transition-colors">
                  <Trash2 size={13}/>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
