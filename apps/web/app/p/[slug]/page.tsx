'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'

interface LPage {
  id: string; title: string; headline: string; subheadline?: string
  heroImageUrl?: string; brandColor: string; ctaText: string
  ctaAction: string; ctaTarget?: string
  formFields: { id: string; label: string; type: string; required: boolean }[]
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export default function PublicLandingPage() {
  const { slug }  = useParams<{ slug: string }>()
  const [page,    setPage]      = useState<LPage | null>(null)
  const [loading, setLoading]   = useState(true)
  const [values,  setValues]    = useState<Record<string, string>>({})
  const [submitting,setSubmitting]=useState(false)
  const [done,    setDone]      = useState(false)
  const [error,   setError]     = useState('')

  useEffect(() => {
    fetch(`${API}/public/pages/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: LPage) => {
        setPage(data)
        const init: Record<string, string> = {}
        data.formFields?.forEach(f => init[f.id] = '')
        setValues(init)
      })
      .catch(() => setError('Page not found.'))
      .finally(() => setLoading(false))
  }, [slug])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSubmitting(true)
    try {
      const r = await fetch(`${API}/public/pages/${slug}/lead`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!r.ok) throw new Error((await r.json()).error)
      setDone(true)
    } catch (e: any) { setError(e.message ?? 'Submission failed.') }
    finally { setSubmitting(false) }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 size={24} className="animate-spin text-violet-500"/></div>
  if (!page)   return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">Page not found or not published.</p></div>

  const color = page.brandColor || '#7C3AED'

  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(135deg, ${color}11, ${color}22, #f9fafb)` }}>
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        {page.heroImageUrl && (
          <img src={page.heroImageUrl} alt="" className="w-full max-h-64 object-cover rounded-2xl mb-8 shadow-xl"/>
        )}

        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-4">{page.headline}</h1>
          {page.subheadline && <p className="text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">{page.subheadline}</p>}
        </div>

        {/* Form card */}
        {page.ctaAction === 'form' && !done && (
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
            <div className="px-6 pt-6 pb-4" style={{ borderBottom: `3px solid ${color}` }}>
              <h2 className="text-lg font-bold text-gray-900">{page.ctaText}</h2>
            </div>
            <form onSubmit={submit} className="p-6 space-y-3">
              {(page.formFields ?? []).map(f => (
                <div key={f.id}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {f.label}{f.required && <span className="text-rose-500 ml-0.5">*</span>}
                  </label>
                  <input type={f.type || 'text'} value={values[f.id] ?? ''} onChange={e => setValues(v => ({ ...v, [f.id]: e.target.value }))}
                    required={f.required} placeholder={f.label}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                    style={{ '--tw-ring-color': color } as React.CSSProperties}
                    onFocus={e => (e.target.style.borderColor = color)}
                    onBlur={e => (e.target.style.borderColor = '')}
                  />
                </div>
              ))}
              {error && <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{error}</p>}
              <button type="submit" disabled={submitting}
                className="w-full text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm shadow-lg"
                style={{ backgroundColor: color }}>
                {submitting ? <><Loader2 size={14} className="animate-spin"/> Please wait…</> : page.ctaText}
              </button>
            </form>
          </div>
        )}

        {done && (
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: color + '22' }}>
              <CheckCircle2 size={28} style={{ color }}/>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Thank you!</h3>
            <p className="text-gray-500 text-sm">We've received your information and will be in touch soon.</p>
          </div>
        )}

        {page.ctaAction === 'url' && page.ctaTarget && (
          <div className="text-center">
            <a href={page.ctaTarget}
              className="inline-block text-white font-bold px-10 py-4 rounded-2xl text-lg shadow-xl transition-all hover:opacity-90"
              style={{ backgroundColor: color }}>
              {page.ctaText} →
            </a>
          </div>
        )}

        {page.ctaAction === 'booking' && page.ctaTarget && (
          <div className="text-center">
            <a href={page.ctaTarget}
              className="inline-block text-white font-bold px-10 py-4 rounded-2xl text-lg shadow-xl hover:opacity-90"
              style={{ backgroundColor: color }}>
              📅 {page.ctaText}
            </a>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center py-4 text-[11px] text-gray-400">
        Powered by CRM Platform
      </div>
    </div>
  )
}
