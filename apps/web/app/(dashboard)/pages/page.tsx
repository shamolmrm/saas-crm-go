'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Globe, Plus, Eye, Copy, Trash2, CheckCircle2, X, ExternalLink, ToggleLeft, ToggleRight, BarChart2 } from 'lucide-react'

interface LPage {
  id: string; title: string; slug: string; headline: string; subheadline?: string
  heroImageUrl?: string; brandColor: string; ctaText: string; ctaAction: string
  published: boolean; views: number; leads: number; createdAt: string
}

export default function LandingPagesPage() {
  const [pages,    setPages]    = useState<LPage[]>([])
  const [loading,  setLoading]  = useState(true)
  const [editing,  setEditing]  = useState<LPage | null>(null)
  const [building, setBuilding] = useState(false)
  const [copied,   setCopied]   = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const [title,    setTitle]    = useState('')
  const [slug,     setSlug]     = useState('')
  const [headline, setHeadline] = useState('')
  const [sub,      setSub]      = useState('')
  const [heroUrl,  setHeroUrl]  = useState('')
  const [color,    setColor]    = useState('#7C3AED')
  const [ctaText,  setCtaText]  = useState('Get Started')

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  useEffect(() => { load() }, [])
  async function load() { setLoading(true); try { const r = await api.get<LPage[]>('/landing-pages'); setPages(r.data) } finally { setLoading(false) } }

  function autoSlug(t: string) { return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) }

  async function save() {
    setError('')
    if (!title.trim() || !slug.trim() || !headline.trim()) { setError('Title, slug, and headline are required'); return }
    setSaving(true)
    try {
      if (editing) {
        await api.patch(`/landing-pages/${editing.id}`, { title, slug, headline, subheadline: sub, heroImageUrl: heroUrl, brandColor: color, ctaText })
      } else {
        await api.post('/landing-pages', { title, slug, headline, subheadline: sub, heroImageUrl: heroUrl, brandColor: color, ctaText })
      }
      setBuilding(false); setEditing(null); resetForm(); load()
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Error saving page') }
    finally { setSaving(false) }
  }

  async function togglePublish(p: LPage) {
    await api.patch(`/landing-pages/${p.id}`, { published: !p.published }); load()
  }

  async function deletePage(id: string) {
    if (!confirm('Delete this landing page?')) return
    await api.delete(`/landing-pages/${id}`); load()
  }

  function openEdit(p: LPage) {
    setEditing(p); setTitle(p.title); setSlug(p.slug); setHeadline(p.headline)
    setSub(p.subheadline ?? ''); setHeroUrl(p.heroImageUrl ?? ''); setColor(p.brandColor); setCtaText(p.ctaText)
    setBuilding(true)
  }

  function resetForm() { setTitle(''); setSlug(''); setHeadline(''); setSub(''); setHeroUrl(''); setColor('#7C3AED'); setCtaText('Get Started'); setError(''); setEditing(null) }

  function copyLink(slug: string) {
    navigator.clipboard.writeText(`${baseUrl}/p/${slug}`).then(() => { setCopied(slug); setTimeout(() => setCopied(''), 2000) })
  }

  // ── Builder ────────────────────────────────────────────────────────────────
  if (building) return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-900">{editing ? 'Edit Page' : 'New Landing Page'}</h2>
        <button onClick={() => { setBuilding(false); resetForm() }}><X size={18} className="text-gray-400"/></button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Form */}
        <div className="space-y-4">
          {error && <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-sm text-rose-600">{error}</div>}

          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <input value={title} onChange={e => { setTitle(e.target.value); if (!editing) setSlug(autoSlug(e.target.value)) }}
              placeholder="Page title *"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200"/>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-gray-400">{baseUrl}/p/</span>
              <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))}
                placeholder="url-slug *"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200"/>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <input value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Main headline *"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200"/>
            <textarea value={sub} onChange={e => setSub(e.target.value)} placeholder="Sub-headline (optional)" rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200 resize-none"/>
            <input value={ctaText} onChange={e => setCtaText(e.target.value)} placeholder="CTA button text"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200"/>
            <input value={heroUrl} onChange={e => setHeroUrl(e.target.value)} placeholder="Hero image URL (optional)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200"/>
            <div className="flex items-center gap-3">
              <label className="text-[12px] text-gray-600">Brand color</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer"/>
              <span className="text-[12px] text-gray-400">{color}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setBuilding(false); resetForm() }} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50">Cancel</button>
            <button onClick={save} disabled={saving}
              className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <CheckCircle2 size={15}/>}
              {editing ? 'Save Changes' : 'Create Page'}
            </button>
          </div>
        </div>

        {/* Live preview */}
        <div className="bg-gray-100 rounded-2xl overflow-hidden border border-gray-200" style={{ minHeight: '400px' }}>
          <div className="text-[10px] text-gray-400 text-center py-1 bg-gray-200 font-medium">PREVIEW</div>
          <div className="relative" style={{ background: `linear-gradient(135deg, ${color}22, ${color}44)` }}>
            {heroUrl && <img src={heroUrl} alt="" className="w-full h-32 object-cover opacity-80"/>}
            <div className="p-6 text-center">
              <h2 className="text-xl font-bold mb-2" style={{ color }}>{headline || 'Your Headline'}</h2>
              {sub && <p className="text-sm text-gray-600 mb-4">{sub}</p>}
              <button className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg" style={{ backgroundColor: color }}>
                {ctaText || 'Get Started'}
              </button>
              <div className="mt-5 space-y-2">
                {['Full Name', 'Email Address', 'Phone Number'].map(f => (
                  <input key={f} disabled placeholder={f} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"/>
                ))}
                <button disabled className="w-full py-2.5 rounded-xl text-sm font-bold text-white opacity-70" style={{ backgroundColor: color }}>
                  {ctaText || 'Get Started'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // ── List ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Globe size={20} className="text-violet-500"/> Landing Pages</h1>
          <p className="text-sm text-gray-400 mt-0.5">Publish pages that capture leads into your CRM automatically</p>
        </div>
        <button onClick={() => { resetForm(); setBuilding(true) }} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          <Plus size={14}/> New Page
        </button>
      </div>

      {loading ? <div className="text-center py-16 text-gray-400">Loading…</div> : pages.length === 0 ? (
        <div className="text-center py-20">
          <Globe size={40} className="text-gray-200 mx-auto mb-3"/>
          <p className="text-gray-400 mb-4">No landing pages yet</p>
          <button onClick={() => { resetForm(); setBuilding(true) }} className="bg-violet-600 text-white text-sm font-semibold px-5 py-2 rounded-lg">Create first page</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pages.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:border-violet-200 transition-all">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: p.brandColor + '22' }}>
                  <Globe size={16} style={{ color: p.brandColor }}/>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 truncate">{p.title}</h3>
                  <p className="text-[11px] text-gray-400 truncate">{p.headline}</p>
                </div>
                <button onClick={() => togglePublish(p)} title={p.published ? 'Unpublish' : 'Publish'}>
                  {p.published ? <ToggleRight size={20} className="text-emerald-500"/> : <ToggleLeft size={20} className="text-gray-300"/>}
                </button>
              </div>

              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                  <span className="text-[11px] text-gray-500 truncate flex-1">/p/{p.slug}</span>
                  <button onClick={() => copyLink(p.slug)}>
                    {copied === p.slug ? <CheckCircle2 size={11} className="text-emerald-500"/> : <Copy size={11} className="text-gray-400 hover:text-violet-600"/>}
                  </button>
                  {p.published && (
                    <a href={`${baseUrl}/p/${p.slug}`} target="_blank" rel="noreferrer">
                      <ExternalLink size={11} className="text-gray-400 hover:text-violet-600"/>
                    </a>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                  <div className="text-lg font-bold text-gray-800">{p.views}</div>
                  <div className="text-[10px] text-gray-400">Views</div>
                </div>
                <div className="bg-violet-50 rounded-lg px-3 py-2 text-center">
                  <div className="text-lg font-bold text-violet-700">{p.leads}</div>
                  <div className="text-[10px] text-violet-400">Leads</div>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => openEdit(p)} className="flex-1 text-[12px] text-violet-600 border border-violet-200 rounded-lg py-1.5 hover:bg-violet-50">Edit</button>
                <button onClick={() => deletePage(p.id)} className="p-1.5 border border-gray-200 rounded-lg text-gray-400 hover:text-rose-500">
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
