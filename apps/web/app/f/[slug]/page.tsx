'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'

interface FormField { id: string; type: string; label: string; placeholder?: string; required: boolean; options?: string[] }
interface FormConfig { id: string; title: string; description?: string; fields: FormField[] }

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export default function PublicFormPage() {
  const { slug } = useParams<{ slug: string }>()
  const [form,     setForm]     = useState<FormConfig | null>(null)
  const [values,   setValues]   = useState<Record<string, string>>({})
  const [loading,  setLoading]  = useState(true)
  const [submitting,setSubmitting]=useState(false)
  const [submitted,setSubmitted]= useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    fetch(`${API}/public/forms/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => { setForm(data); const init: Record<string,string> = {}; data.fields.forEach((f: FormField) => init[f.id] = ''); setValues(init) })
      .catch(() => setError('Form not found or inactive.'))
      .finally(() => setLoading(false))
  }, [slug])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    // Validate required
    const missing = form!.fields.filter(f => f.required && !values[f.id]?.trim())
    if (missing.length) { setError(`Please fill: ${missing.map(f => f.label).join(', ')}`); return }
    setError(''); setSubmitting(true)
    try {
      const r = await fetch(`${API}/public/forms/${slug}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: values }),
      })
      if (!r.ok) throw new Error((await r.json()).error)
      setSubmitted(true)
    } catch (e: any) { setError(e.message ?? 'Submission failed. Please try again.') }
    finally { setSubmitting(false) }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 size={24} className="text-violet-500 animate-spin"/>
    </div>
  )

  if (error && !form) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8">
        <p className="text-gray-500 text-lg">{error}</p>
      </div>
    </div>
  )

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 max-w-sm">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={32} className="text-emerald-600"/>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Thank you!</h2>
        <p className="text-gray-500">Your submission has been received. We'll be in touch soon.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-br from-violet-600 to-violet-800 px-6 py-8 text-center">
          <h1 className="text-2xl font-bold text-white">{form?.title}</h1>
          {form?.description && <p className="text-violet-200 mt-1 text-sm">{form.description}</p>}
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {form?.fields.map(f => (
            <div key={f.id}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {f.label}{f.required && <span className="text-rose-500 ml-0.5">*</span>}
              </label>
              {f.type === 'textarea' ? (
                <textarea value={values[f.id] ?? ''} onChange={e => setValues(v => ({ ...v, [f.id]: e.target.value }))}
                  placeholder={f.placeholder} rows={3} required={f.required}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 resize-none transition-all"/>
              ) : f.type === 'select' && f.options ? (
                <select value={values[f.id] ?? ''} onChange={e => setValues(v => ({ ...v, [f.id]: e.target.value }))}
                  required={f.required}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400">
                  <option value="">{f.placeholder ?? 'Select…'}</option>
                  {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === 'checkbox' ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!values[f.id]} onChange={e => setValues(v => ({ ...v, [f.id]: e.target.checked ? 'yes' : '' }))}
                    required={f.required} className="accent-violet-600 w-4 h-4"/>
                  <span className="text-sm text-gray-600">{f.placeholder ?? f.label}</span>
                </label>
              ) : (
                <input type={f.type} value={values[f.id] ?? ''} onChange={e => setValues(v => ({ ...v, [f.id]: e.target.value }))}
                  placeholder={f.placeholder} required={f.required}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all"/>
              )}
            </div>
          ))}

          {error && <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-4 py-2">{error}</p>}

          <button type="submit" disabled={submitting}
            className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            {submitting ? <><Loader2 size={16} className="animate-spin"/> Submitting…</> : 'Submit'}
          </button>
        </form>
      </div>
    </div>
  )
}
