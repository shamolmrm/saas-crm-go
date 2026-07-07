'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { ClipboardList, Plus, Trash2, Copy, ExternalLink, Eye, ToggleLeft, ToggleRight, X, CheckCircle2, BarChart2, Star } from 'lucide-react'

interface Question { id: string; type: string; question: string; options?: string[]; required: boolean }
interface Survey    { id: string; title: string; description?: string; slug: string; questions: Question[]; isActive: boolean; thankYouMsg: string; _count: { responses: number } }

const Q_TYPES = [
  { value: 'nps',    label: 'NPS (0–10)'  },
  { value: 'rating', label: 'Rating (1–5)' },
  { value: 'text',   label: 'Open Text'   },
  { value: 'choice', label: 'Multiple Choice' },
  { value: 'yesno',  label: 'Yes / No'    },
]

const DEFAULT_QUESTIONS: Question[] = [
  { id: 'q1', type: 'nps',  question: 'How likely are you to recommend us? (0 = Not at all, 10 = Absolutely)', required: true },
  { id: 'q2', type: 'text', question: 'What could we do better?', required: false },
]

export default function SurveysPage() {
  const [surveys,   setSurveys]   = useState<Survey[]>([])
  const [loading,   setLoading]   = useState(true)
  const [building,  setBuilding]  = useState(false)
  const [editing,   setEditing]   = useState<Survey | null>(null)
  const [copied,    setCopied]    = useState('')
  const [viewData,  setViewData]  = useState<{ survey: Survey; aggregates: Record<string, unknown>; responses: unknown[] } | null>(null)

  const [title,     setTitle]     = useState('')
  const [desc,      setDesc]      = useState('')
  const [questions, setQuestions] = useState<Question[]>(DEFAULT_QUESTIONS)
  const [thankYou,  setThankYou]  = useState('Thank you for your feedback!')
  const [saving,    setSaving]    = useState(false)

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    try { const r = await api.get<Survey[]>('/surveys'); setSurveys(r.data) } finally { setLoading(false) }
  }

  async function save() {
    if (!title.trim() || questions.length === 0) return
    setSaving(true)
    try {
      if (editing) await api.patch(`/surveys/${editing.id}`, { title, description: desc, questions, thankYouMsg: thankYou })
      else         await api.post('/surveys', { title, description: desc, questions, thankYouMsg: thankYou })
      setBuilding(false); setEditing(null); reset(); load()
    } catch (e: any) { alert(e?.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  async function deleteSurvey(id: string) {
    if (!confirm('Delete this survey and all responses?')) return
    await api.delete(`/surveys/${id}`); load()
  }

  async function toggleActive(s: Survey) { await api.patch(`/surveys/${s.id}`, { isActive: !s.isActive }); load() }

  async function viewResults(s: Survey) {
    const r = await api.get<{ survey: Survey; aggregates: Record<string, unknown>; responses: unknown[] }>(`/surveys/${s.id}`)
    setViewData(r.data)
  }

  function openEdit(s: Survey) {
    setEditing(s); setTitle(s.title); setDesc(s.description ?? ''); setQuestions(s.questions); setThankYou(s.thankYouMsg)
    setBuilding(true)
  }
  function reset() { setTitle(''); setDesc(''); setQuestions(DEFAULT_QUESTIONS); setThankYou('Thank you for your feedback!'); setEditing(null) }

  function addQuestion() {
    setQuestions(prev => [...prev, { id: `q_${Date.now()}`, type: 'text', question: 'New question', required: true }])
  }
  function updQ(idx: number, key: string, val: unknown) { setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, [key]: val } : q)) }
  function remQ(idx: number) { setQuestions(prev => prev.filter((_, i) => i !== idx)) }
  function copyLink(slug: string) { navigator.clipboard.writeText(`${baseUrl}/s/${slug}`).then(() => { setCopied(slug); setTimeout(() => setCopied(''), 2000) }) }

  // ── Results view ───────────────────────────────────────────────────────────
  if (viewData) {
    const { survey, aggregates, responses } = viewData
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <button onClick={() => setViewData(null)} className="text-sm text-gray-500 hover:text-gray-800 mb-4 flex items-center gap-1">← Back</button>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{survey.title} — Results</h2>
          <span className="text-sm text-gray-400">{(responses as unknown[]).length} responses</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {survey.questions.map(q => {
            const agg = aggregates[q.id]
            return (
              <div key={q.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{q.type.toUpperCase()}</p>
                <p className="text-sm font-medium text-gray-800 mb-3">{q.question}</p>

                {(q.type === 'nps' || q.type === 'rating') && !!agg && (
                  <div className="text-center">
                    <div className="text-3xl font-bold text-violet-600">{String((agg as { avg: string }).avg ?? '–')}</div>
                    <div className="text-[11px] text-gray-400">{String((agg as { count: number }).count)} responses</div>
                    {q.type === 'nps' && (
                      <div className="flex justify-center mt-2 gap-0.5">
                        {Array.from({ length: 11 }, (_, i) => (
                          <div key={i} className={`flex-1 h-6 rounded text-[9px] flex items-center justify-center text-white font-bold
                            ${i <= 6 ? 'bg-rose-400' : i <= 8 ? 'bg-amber-400' : 'bg-emerald-500'}`}>
                            {String((agg as { distribution: Record<number, number> }).distribution?.[i] || '')}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(q.type === 'choice' || q.type === 'yesno') && !!agg && (
                  <div className="space-y-1.5">
                    {Object.entries(agg as Record<string, number>).map(([opt, count]: [string, number]) => (
                      <div key={opt} className="flex items-center gap-2">
                        <span className="text-[12px] text-gray-600 w-16 truncate">{opt}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-500 rounded-full" style={{ width: `${(count / (responses as unknown[]).length) * 100}%` }}/>
                        </div>
                        <span className="text-[11px] font-semibold text-gray-600 w-6 text-right">{String(count)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {q.type === 'text' && Array.isArray(agg) && agg.length > 0 && (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {(agg as string[]).slice(0, 5).map((txt, i) => (
                      <p key={i} className="text-[12px] text-gray-600 bg-gray-50 rounded px-2 py-1">{txt}</p>
                    ))}
                    {(agg as string[]).length > 5 && <p className="text-[11px] text-gray-400">+{(agg as string[]).length - 5} more</p>}
                  </div>
                )}

                {!agg && <p className="text-sm text-gray-400 text-center py-3">No data yet</p>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Builder ────────────────────────────────────────────────────────────────
  if (building) return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-900">{editing ? 'Edit Survey' : 'Create Survey'}</h2>
        <button onClick={() => { setBuilding(false); reset() }}><X size={18} className="text-gray-400 hover:text-gray-700"/></button>
      </div>

      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Survey title *"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200"/>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (optional)" rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200 resize-none"/>
          <input value={thankYou} onChange={e => setThankYou(e.target.value)} placeholder="Thank-you message"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200"/>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800 text-sm">Questions</h3>
            <button onClick={addQuestion} className="flex items-center gap-1.5 text-sm text-violet-600 font-medium"><Plus size={13}/> Add</button>
          </div>
          <div className="space-y-3">
            {questions.map((q, idx) => (
              <div key={q.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex gap-2 mb-2">
                  <select value={q.type} onChange={e => updQ(idx, 'type', e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-violet-200">
                    {Q_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <label className="flex items-center gap-1.5 text-[12px] text-gray-600 ml-auto">
                    <input type="checkbox" checked={q.required} onChange={e => updQ(idx, 'required', e.target.checked)} className="accent-violet-600"/>
                    Required
                  </label>
                  <button onClick={() => remQ(idx)} className="text-gray-300 hover:text-rose-400"><X size={13}/></button>
                </div>
                <textarea value={q.question} onChange={e => updQ(idx, 'question', e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-violet-200 resize-none"
                  placeholder="Question text…"/>
                {q.type === 'choice' && (
                  <input value={q.options?.join(', ') ?? ''} onChange={e => updQ(idx, 'options', e.target.value.split(',').map(s => s.trim()))}
                    placeholder="Options: Option A, Option B, Option C"
                    className="mt-2 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-violet-200"/>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={() => { setBuilding(false); reset() }} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={!title.trim() || saving}
            className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <CheckCircle2 size={15}/>}
            {editing ? 'Save Changes' : 'Create Survey'}
          </button>
        </div>
      </div>
    </div>
  )

  // ── List ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><ClipboardList size={20} className="text-amber-500"/> Surveys</h1>
          <p className="text-sm text-gray-400 mt-0.5">Collect customer feedback with NPS, rating & open-text questions</p>
        </div>
        <button onClick={() => { reset(); setBuilding(true) }}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          <Plus size={14}/> New Survey
        </button>
      </div>

      {loading ? <div className="text-center py-16 text-gray-400">Loading…</div> : surveys.length === 0 ? (
        <div className="text-center py-20">
          <ClipboardList size={40} className="text-gray-200 mx-auto mb-3"/>
          <p className="text-gray-400 mb-4">No surveys yet</p>
          <button onClick={() => { reset(); setBuilding(true) }} className="bg-violet-600 text-white text-sm font-semibold px-5 py-2 rounded-lg">
            Create first survey
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {surveys.map(s => (
            <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:border-violet-200 transition-all">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 truncate">{s.title}</h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">{s.questions.length} questions · {s._count.responses} responses</p>
                </div>
                <button onClick={() => toggleActive(s)}>
                  {s.isActive ? <ToggleRight size={20} className="text-emerald-500"/> : <ToggleLeft size={20} className="text-gray-300"/>}
                </button>
              </div>
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 mb-3">
                <span className="text-[11px] text-gray-500 flex-1 truncate">/s/{s.slug}</span>
                <button onClick={() => copyLink(s.slug)}>
                  {copied === s.slug ? <CheckCircle2 size={13} className="text-emerald-500"/> : <Copy size={13} className="text-gray-400 hover:text-violet-600"/>}
                </button>
                <a href={`${baseUrl}/s/${s.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} className="text-gray-400 hover:text-violet-600"/>
                </a>
              </div>
              <div className="flex gap-2">
                <button onClick={() => viewResults(s)} className="flex-1 flex items-center justify-center gap-1.5 text-[12px] text-gray-600 border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50">
                  <BarChart2 size={12}/> Results ({s._count.responses})
                </button>
                <button onClick={() => openEdit(s)} className="flex-1 flex items-center justify-center gap-1.5 text-[12px] text-violet-600 border border-violet-200 rounded-lg py-1.5 hover:bg-violet-50">Edit</button>
                <button onClick={() => deleteSurvey(s.id)} className="p-1.5 border border-gray-200 rounded-lg text-gray-400 hover:text-rose-500 hover:border-rose-200">
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
