'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'

interface Question { id: string; type: string; question: string; options?: string[]; required: boolean }
interface SurveyConfig { id: string; title: string; description?: string; questions: Question[]; thankYouMsg: string }

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export default function PublicSurveyPage() {
  const { slug } = useParams<{ slug: string }>()
  const [survey,     setSurvey]     = useState<SurveyConfig | null>(null)
  const [answers,    setAnswers]     = useState<Record<string, string | number>>({})
  const [email,      setEmail]       = useState('')
  const [loading,    setLoading]     = useState(true)
  const [submitting, setSubmitting]  = useState(false)
  const [submitted,  setSubmitted]   = useState(false)
  const [thankYou,   setThankYou]    = useState('')
  const [error,      setError]       = useState('')

  useEffect(() => {
    fetch(`${API}/public/surveys/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setSurvey(data))
      .catch(() => setError('Survey not found or inactive.'))
      .finally(() => setLoading(false))
  }, [slug])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const missing = survey!.questions.filter(q => q.required && answers[q.id] == null)
    if (missing.length) { setError(`Please answer: ${missing.map(q => q.question.slice(0,30)).join('; ')}`); return }
    setError(''); setSubmitting(true)
    try {
      const r = await fetch(`${API}/public/surveys/${slug}/respond`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, email: email || undefined }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      setThankYou(data.thankYouMsg); setSubmitted(true)
    } catch (e: any) { setError(e.message ?? 'Failed to submit.') }
    finally { setSubmitting(false) }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 size={24} className="text-violet-500 animate-spin"/></div>
  if (error && !survey) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">{error}</p></div>

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 max-w-sm">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={32} className="text-emerald-500"/>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Thank you!</h2>
        <p className="text-gray-500">{thankYou}</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-amber-50 py-10 px-4">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-xl border border-amber-100 overflow-hidden">
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 px-6 py-8 text-center">
          <h1 className="text-2xl font-bold text-white">{survey?.title}</h1>
          {survey?.description && <p className="text-amber-100 mt-1 text-sm">{survey.description}</p>}
        </div>

        <form onSubmit={submit} className="p-6 space-y-6">
          {survey?.questions.map((q, idx) => (
            <div key={q.id} className="pb-5 border-b border-gray-50 last:border-0">
              <p className="text-[11px] font-semibold text-gray-400 uppercase mb-1">Question {idx + 1}</p>
              <p className="text-sm font-medium text-gray-800 mb-3">
                {q.question}{q.required && <span className="text-rose-500 ml-0.5">*</span>}
              </p>

              {q.type === 'nps' && (
                <div className="flex gap-1">
                  {Array.from({ length: 11 }, (_, i) => (
                    <button type="button" key={i} onClick={() => setAnswers(a => ({ ...a, [q.id]: i }))}
                      className={`flex-1 py-2 rounded-lg text-[12px] font-bold border-2 transition-all ${answers[q.id] === i ? 'border-amber-500 bg-amber-500 text-white' : 'border-gray-100 text-gray-600 hover:border-amber-200'}`}>
                      {i}
                    </button>
                  ))}
                </div>
              )}

              {q.type === 'rating' && (
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(n => (
                    <button type="button" key={n} onClick={() => setAnswers(a => ({ ...a, [q.id]: n }))}
                      className={`flex-1 py-3 rounded-xl text-lg border-2 transition-all ${answers[q.id] === n ? 'border-amber-500 bg-amber-50 text-amber-600' : 'border-gray-100 text-gray-400 hover:border-amber-200'}`}>
                      {'★'.repeat(n)}{'☆'.repeat(5-n)}
                    </button>
                  ))}
                </div>
              )}

              {q.type === 'yesno' && (
                <div className="flex gap-3">
                  {['Yes','No'].map(opt => (
                    <button type="button" key={opt} onClick={() => setAnswers(a => ({ ...a, [q.id]: opt }))}
                      className={`flex-1 py-3 rounded-xl font-semibold text-sm border-2 transition-all ${answers[q.id] === opt ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-100 text-gray-500 hover:border-amber-200'}`}>
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {q.type === 'choice' && q.options && (
                <div className="space-y-2">
                  {q.options.map(opt => (
                    <button type="button" key={opt} onClick={() => setAnswers(a => ({ ...a, [q.id]: opt }))}
                      className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-all ${answers[q.id] === opt ? 'border-amber-500 bg-amber-50 text-amber-700 font-medium' : 'border-gray-100 text-gray-600 hover:border-amber-200'}`}>
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {q.type === 'text' && (
                <textarea value={String(answers[q.id] ?? '')} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                  rows={3} placeholder="Your answer…"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-200 resize-none"/>
              )}
            </div>
          ))}

          {/* Optional email */}
          <div>
            <p className="text-[11px] text-gray-400 mb-1">Your email (optional — to link response to your CRM record)</p>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-200"/>
          </div>

          {error && <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-4 py-2">{error}</p>}

          <button type="submit" disabled={submitting}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
            {submitting ? <><Loader2 size={16} className="animate-spin"/> Submitting…</> : 'Submit Feedback'}
          </button>
        </form>
      </div>
    </div>
  )
}
