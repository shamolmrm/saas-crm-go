'use client'

import { useState } from 'react'
import { Search, Globe, Mail, Phone, MapPin, Users, Package, Link2,
         Linkedin, Facebook, Twitter, Instagram, Youtube, Github,
         MessageCircle, ChevronDown, ChevronUp, CheckCircle2,
         XCircle, Clock, AlertCircle, Loader2, ExternalLink, Building2,
         Star, TrendingUp, Layers } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Contact { name?: string; email?: string; phone?: string; company?: string; industry?: string }
interface SocialMap { linkedin?: string; facebook?: string; twitter?: string; instagram?: string; youtube?: string; tiktok?: string; github?: string; whatsapp?: string; pinterest?: string }
interface Product  { name?: string; type?: string; description?: string; price?: string | number; currency?: string; price_text?: string }
interface TeamMember { name?: string; title?: string; email?: string; linkedin?: string; image?: string }
interface AnalysisResult {
  url: string; domain: string; duration_ms: number
  business: { name?: string; description?: string; logo?: string; hours?: string | string[]; founded?: string; employees?: string | number }
  meta: { title?: string; description?: string; keywords?: string; generator?: string; author?: string }
  address?: string
  contacts: Contact[]
  social: SocialMap
  products: Product[]
  team: TeamMember[]
  pages_found: string[]
  total_emails: number
  total_phones: number
}

interface Lead {
  id: string; name: string; email?: string; phone?: string; company?: string
  industry?: string; website?: string; address?: string; status: string
  createdAt: string
  leadSource?: { query: string; provider: string }
  rawData?: Record<string, unknown>
}

// ── Social icons ──────────────────────────────────────────────────────────────

const SOCIAL_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  linkedin:  { icon: <Linkedin  size={14}/>, label: 'LinkedIn',    color: 'bg-[#0A66C2]' },
  facebook:  { icon: <Facebook  size={14}/>, label: 'Facebook',    color: 'bg-[#1877F2]' },
  twitter:   { icon: <Twitter   size={14}/>, label: 'X / Twitter', color: 'bg-[#1DA1F2]' },
  instagram: { icon: <Instagram size={14}/>, label: 'Instagram',   color: 'bg-[#E1306C]' },
  youtube:   { icon: <Youtube   size={14}/>, label: 'YouTube',     color: 'bg-[#FF0000]' },
  github:    { icon: <Github    size={14}/>, label: 'GitHub',      color: 'bg-[#24292E]' },
  whatsapp:  { icon: <MessageCircle size={14}/>, label: 'WhatsApp', color: 'bg-[#25D366]' },
  tiktok:    { icon: <Star      size={14}/>, label: 'TikTok',      color: 'bg-[#010101]' },
  pinterest: { icon: <Star      size={14}/>, label: 'Pinterest',   color: 'bg-[#E60023]' },
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [activeTab, setActiveTab] = useState<'analyzer' | 'order' | 'staged'>('analyzer')

  // Analyzer state
  const [analyzeUrl, setAnalyzeUrl] = useState('')
  const [analyzing,  setAnalyzing]  = useState(false)
  const [analyzeErr, setAnalyzeErr] = useState('')
  const [result,     setResult]     = useState<AnalysisResult | null>(null)
  const [selected,   setSelected]   = useState<Set<number>>(new Set())
  const [importing,  setImporting]  = useState(false)
  const [importMsg,  setImportMsg]  = useState('')

  // Staged leads state
  const [leads,        setLeads]       = useState<Lead[]>([])
  const [leadsStatus,  setLeadsStatus] = useState<'PENDING' | 'IMPORTED' | 'REJECTED'>('PENDING')
  const [leadsLoaded,  setLeadsLoaded] = useState(false)
  const [loadingLeads, setLoadingLeads] = useState(false)

  // Order form state — lifted here only for tab switching
  const [orderDone, setOrderDone] = useState(false)

  // ── Analyze ────────────────────────────────────────────────────────────────

  async function runAnalysis() {
    const url = analyzeUrl.trim()
    if (!url) return
    const withProto = url.startsWith('http') ? url : `https://${url}`
    setAnalyzing(true); setAnalyzeErr(''); setResult(null); setSelected(new Set()); setImportMsg('')
    try {
      const res = await fetch('/api/leads/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: withProto }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setResult(data)
      setSelected(new Set((data.contacts as Contact[]).map((_, i) => i)))
    } catch (e) {
      setAnalyzeErr(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setAnalyzing(false)
    }
  }

  function toggleAll() {
    if (!result) return
    if (selected.size === result.contacts.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(result.contacts.map((_, i) => i)))
    }
  }

  async function importSelected() {
    if (!result || selected.size === 0) return
    setImporting(true); setImportMsg('')
    const contacts = [...selected].map(i => result.contacts[i])
    try {
      let count = 0
      for (const c of contacts) {
        if (!c.email && !c.phone) continue
        const r = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:    c.name || c.company || result.domain,
            email:   c.email,
            phone:   c.phone,
            company: c.company || result.business?.name,
            notes:   c.industry ? `Industry: ${c.industry}` : undefined,
          }),
        })
        if (r.ok) count++
      }
      setImportMsg(count > 0 ? `${count} contact${count !== 1 ? 's' : ''} imported to CRM.` : 'No valid contacts to import.')
    } catch {
      setImportMsg('Network error during import.')
    } finally {
      setImporting(false)
    }
  }

  // ── Load staged leads ──────────────────────────────────────────────────────

  async function loadLeads(status: 'PENDING' | 'IMPORTED' | 'REJECTED') {
    setLeadsStatus(status); setLoadingLeads(true); setLeadsLoaded(false)
    try {
      const res = await fetch(`/api/leads?status=${status}`)
      const data = await res.json()
      setLeads(Array.isArray(data) ? data : [])
      setLeadsLoaded(true)
    } finally { setLoadingLeads(false) }
  }

  async function importLead(id: string) {
    await fetch(`/api/leads/${id}/import`, { method: 'POST' })
    setLeads(prev => prev.filter(l => l.id !== id))
  }

  async function rejectLead(id: string) {
    await fetch(`/api/leads/${id}/reject`, { method: 'POST' })
    setLeads(prev => prev.filter(l => l.id !== id))
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Lead Generation</h1>
        <p className="text-sm text-gray-500 mt-0.5">Paste any website URL — extract contacts, socials, products, team members and more</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: 'analyzer' as const, label: 'Website Analyzer', icon: <Globe size={14}/> },
          { id: 'order'    as const, label: 'Order Form',        icon: <Package size={14}/> },
          { id: 'staged'   as const, label: 'Staged Leads',      icon: <Users size={14}/> },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id)
              if (tab.id === 'staged' && !leadsLoaded) loadLeads('PENDING')
            }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-violet-600 text-violet-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── Website Analyzer tab ─────────────────────────────────────────── */}
      {activeTab === 'analyzer' && (
        <div className="flex flex-col gap-6">
          {/* URL input */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
              <Globe size={16} className="text-violet-600"/> Website URL
            </label>
            <div className="flex gap-3">
              <input
                type="url"
                value={analyzeUrl}
                onChange={e => setAnalyzeUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runAnalysis()}
                placeholder="https://example.com — paste any business website"
                className="flex-1 px-4 py-3 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <button
                onClick={runAnalysis}
                disabled={analyzing || !analyzeUrl.trim()}
                className="px-6 py-3 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2 min-w-[160px] justify-center"
              >
                {analyzing
                  ? <><Loader2 size={16} className="animate-spin"/> Analyzing…</>
                  : <><Search size={16}/> Analyze Website</>
                }
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Automatically discovers contact, about, team, products and services pages — extracts all emails, phones, social links, addresses and more.
            </p>
          </div>

          {/* Error */}
          {analyzeErr && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0"/>
              <div>
                <p className="text-sm font-medium text-red-700">{analyzeErr}</p>
                {analyzeErr.toLowerCase().includes('offline') && (
                  <p className="text-xs text-red-500 mt-1">Start the scraper: <code className="bg-red-100 px-1 rounded">apps/scraper/start.bat</code></p>
                )}
              </div>
            </div>
          )}

          {/* Loading */}
          {analyzing && (
            <div className="grid grid-cols-3 gap-4 animate-pulse">
              {[1,2,3].map(i => <div key={i} className="bg-gray-100 rounded-xl h-28"/>)}
            </div>
          )}

          {/* Results */}
          {result && !analyzing && (
            <AnalysisView
              result={result}
              selected={selected}
              onToggle={i => {
                setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
              }}
              onToggleAll={toggleAll}
              onImport={importSelected}
              importing={importing}
              importMsg={importMsg}
            />
          )}
        </div>
      )}

      {/* ── Order Form tab ───────────────────────────────────────────────── */}
      {activeTab === 'order' && <OrderFormTab onSuccess={() => setOrderDone(true)} />}

      {/* ── Staged Leads tab ─────────────────────────────────────────────── */}
      {activeTab === 'staged' && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            {(['PENDING','IMPORTED','REJECTED'] as const).map(s => (
              <button
                key={s}
                onClick={() => loadLeads(s)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  leadsStatus === s
                    ? 'bg-violet-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {s === 'PENDING' ? 'Pending Review' : s === 'IMPORTED' ? 'Imported' : 'Rejected'}
              </button>
            ))}
          </div>

          {loadingLeads && <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-violet-500"/></div>}

          {leadsLoaded && leads.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Users size={40} className="mx-auto mb-3 opacity-30"/>
              <p>No {leadsStatus.toLowerCase()} leads</p>
            </div>
          )}

          {leadsLoaded && leads.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {leads.map(lead => (
                <LeadCard key={lead.id} lead={lead}
                  onImport={() => importLead(lead.id)}
                  onReject={() => rejectLead(lead.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Analysis result view ──────────────────────────────────────────────────────

function AnalysisView({
  result, selected, onToggle, onToggleAll, onImport, importing, importMsg
}: {
  result: AnalysisResult
  selected: Set<number>
  onToggle: (i: number) => void
  onToggleAll: () => void
  onImport: () => void
  importing: boolean
  importMsg: string
}) {
  const [showAllContacts, setShowAllContacts] = useState(false)
  const socialEntries = Object.entries(result.social).filter(([, v]) => v)

  return (
    <div className="flex flex-col gap-5">
      {/* Business header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-start gap-4 flex-wrap">
          {result.business.logo ? (
            <img src={result.business.logo} alt="logo"
              className="w-16 h-16 rounded-lg object-cover border border-gray-100 shrink-0"/>
          ) : (
            <div className="w-16 h-16 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
              <Building2 size={28} className="text-violet-500"/>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900">{result.business.name || result.domain}</h2>
              <a href={result.url} target="_blank" rel="noreferrer" className="text-violet-500 hover:text-violet-700">
                <ExternalLink size={14}/>
              </a>
            </div>
            {result.business.description && (
              <p className="text-sm text-gray-600 mt-1 line-clamp-2">{result.business.description}</p>
            )}
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
              {result.business.founded   && <span className="flex items-center gap-1"><Clock size={11}/> Founded {result.business.founded}</span>}
              {result.business.employees && <span className="flex items-center gap-1"><Users size={11}/> {result.business.employees} employees</span>}
              {result.address && <span className="flex items-center gap-1"><MapPin size={11}/> {result.address}</span>}
            </div>
          </div>
          {/* Stats */}
          <div className="flex gap-5 shrink-0">
            <Stat label="Emails"  value={result.total_emails}          color="text-blue-600"/>
            <Stat label="Phones"  value={result.total_phones}          color="text-green-600"/>
            <Stat label="Pages"   value={result.pages_found.length}    color="text-violet-600"/>
            <Stat label="Time"    value={`${(result.duration_ms/1000).toFixed(1)}s`} color="text-orange-500"/>
          </div>
        </div>

        {/* Social media */}
        {socialEntries.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {socialEntries.map(([name, url]) => {
              const meta = SOCIAL_META[name]
              if (!meta || !url) return null
              return (
                <a key={name} href={url} target="_blank" rel="noreferrer"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-medium ${meta.color} opacity-90 hover:opacity-100 transition-opacity`}>
                  {meta.icon} {meta.label}
                </a>
              )
            })}
          </div>
        )}

        {/* Pages crawled */}
        {result.pages_found.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {result.pages_found.map((p, i) => (
              <span key={i} className="px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-500">{p || '/'}</span>
            ))}
          </div>
        )}
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Contacts (spans 2 columns) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Mail size={16} className="text-blue-500"/>
              Contacts found
              <span className="text-xs bg-blue-100 text-blue-600 rounded-full px-2 py-0.5">{result.contacts.length}</span>
            </h3>
            <button onClick={onToggleAll} className="text-xs text-gray-500 hover:text-violet-600 underline">
              {selected.size === result.contacts.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          <div className="divide-y divide-gray-50">
            {(showAllContacts ? result.contacts : result.contacts.slice(0, 8)).map((c, i) => (
              <ContactRow key={i} contact={c} idx={i} selected={selected.has(i)} onToggle={onToggle}/>
            ))}
          </div>

          {result.contacts.length > 8 && (
            <button
              onClick={() => setShowAllContacts(v => !v)}
              className="w-full py-3 text-sm text-violet-600 hover:bg-violet-50 flex items-center justify-center gap-1 border-t border-gray-100"
            >
              {showAllContacts
                ? <><ChevronUp size={14}/> Show less</>
                : <><ChevronDown size={14}/> Show all {result.contacts.length} contacts</>
              }
            </button>
          )}

          {result.contacts.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <Mail size={32} className="mx-auto mb-2 opacity-30"/>
              <p className="text-sm">No email or phone contacts found on this site</p>
              <p className="text-xs mt-1">Try a page with a contact form, team page, or business directory listing</p>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Products / Services */}
          {result.products.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-3">
                <Package size={16} className="text-orange-500"/> Products / Services
              </h3>
              <ul className="flex flex-col gap-2.5">
                {result.products.map((p, i) => (
                  <li key={i} className="text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-gray-800">{p.name}</span>
                      {(p.price !== undefined || p.price_text) && (
                        <span className="text-green-600 font-semibold text-xs shrink-0">
                          {p.price !== undefined ? `${p.currency || ''} ${p.price}`.trim() : p.price_text}
                        </span>
                      )}
                    </div>
                    {p.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{p.description}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Team members */}
          {result.team.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-3">
                <Users size={16} className="text-violet-500"/> Team Members
              </h3>
              <ul className="flex flex-col gap-3">
                {result.team.map((m, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-600 shrink-0">
                      {(m.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800">{m.name}</p>
                      {m.title && <p className="text-xs text-gray-500 truncate">{m.title}</p>}
                      {m.email && <p className="text-xs text-blue-600 truncate">{m.email}</p>}
                    </div>
                    {m.linkedin && (
                      <a href={m.linkedin} target="_blank" rel="noreferrer" className="text-[#0A66C2] shrink-0">
                        <Linkedin size={14}/>
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Site info */}
          {(result.meta.generator || result.meta.keywords || result.meta.author) && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-3">
                <Layers size={16} className="text-gray-400"/> Site Info
              </h3>
              <dl className="flex flex-col gap-1.5 text-xs">
                {result.meta.generator && <MetaRow label="Platform" val={result.meta.generator}/>}
                {result.meta.author    && <MetaRow label="Author"   val={result.meta.author}/>}
                {result.meta.keywords  && <MetaRow label="Keywords" val={result.meta.keywords.slice(0,120)}/>}
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* Import action bar */}
      <div className={`rounded-xl p-4 flex items-center justify-between gap-4 ${importMsg && importMsg.includes('import') ? 'bg-green-600' : 'bg-violet-600'}`}>
        <div className="text-white">
          <p className="font-semibold">
            {importMsg
              ? importMsg
              : `${selected.size} contact${selected.size !== 1 ? 's' : ''} selected`
            }
          </p>
          {!importMsg && (
            <p className="text-violet-200 text-xs mt-0.5">Click to import into Contacts</p>
          )}
        </div>
        <button
          onClick={onImport}
          disabled={importing || selected.size === 0}
          className="px-5 py-2.5 bg-white text-violet-700 font-semibold rounded-lg hover:bg-violet-50 disabled:opacity-50 flex items-center gap-2 text-sm shrink-0"
        >
          {importing ? <Loader2 size={15} className="animate-spin"/> : <TrendingUp size={15}/>}
          {importing ? 'Importing…' : 'Import to CRM'}
        </button>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ContactRow({ contact, idx, selected, onToggle }: {
  contact: Contact; idx: number; selected: boolean; onToggle: (i: number) => void
}) {
  return (
    <div
      onClick={() => onToggle(idx)}
      className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors ${selected ? 'bg-violet-50' : 'hover:bg-gray-50'}`}
    >
      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${selected ? 'bg-violet-600 border-violet-600' : 'border-gray-300'}`}>
        {selected && <CheckCircle2 size={12} className="text-white"/>}
      </div>
      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
        {(contact.name || contact.email || contact.phone || '?').charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        {contact.name && <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>}
        {contact.email && <p className="text-xs text-blue-600 truncate flex items-center gap-1"><Mail size={10}/> {contact.email}</p>}
        {contact.phone && <p className="text-xs text-green-600 flex items-center gap-1"><Phone size={10}/> {contact.phone}</p>}
      </div>
      {contact.industry && (
        <span className="text-xs text-gray-400 shrink-0 hidden sm:block">{contact.industry}</span>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  )
}

function MetaRow({ label, val }: { label: string; val: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-gray-400 w-16 shrink-0">{label}</dt>
      <dd className="text-gray-700 break-all">{val}</dd>
    </div>
  )
}

// ── Order Form Tab ────────────────────────────────────────────────────────────

const LEAD_TYPES = [
  { id: 'B2B', label: 'B2B Lead Generation', sub: 'Business to Business', icon: '🏢' },
  { id: 'B2C', label: 'B2C Lead Generation', sub: 'Business to Consumer', icon: '🛍️' },
  { id: 'Ecommerce', label: 'E-commerce / Online Store', sub: 'Product & retail leads', icon: '🛒' },
  { id: 'RealEstate', label: 'Real Estate Leads', sub: 'Property buyers & agents', icon: '🏠' },
]

const INDUSTRIES = ['Real Estate', 'Technology & Software (IT/SaaS)', 'Healthcare & Medical',
  'E-commerce & Retail', 'Marketing & Advertising', 'Construction & Architecture',
  'Restaurants & Hospitality', 'Finance & Banking', 'Education & Training', 'Legal & Law Firms']

const JOB_TITLES = ['C-Level Executives (CEO, CFO, COO)', 'Founders / Owners',
  'Marketing Directors / Managers', 'HR / Recruitment Managers',
  'Sales / Business Development', 'IT Directors / CTOs', 'Operations Managers']

const COMPANY_SIZES = [
  { id: '1-10',    label: '1 – 10',    sub: 'Startup' },
  { id: '11-50',   label: '11 – 50',   sub: 'Small' },
  { id: '51-200',  label: '51 – 200',  sub: 'Medium' },
  { id: '201-500', label: '201 – 500', sub: 'Growing' },
  { id: '500+',    label: '500+',      sub: 'Enterprise' },
]

const DATA_FIELDS = [
  { group: 'Contact Information', fields: [
    { id: 'First & Last Name',       label: 'First & Last Name',        recommended: true  },
    { id: 'Job Title',               label: 'Job Title / Designation',  recommended: false },
    { id: 'Valid Business Email',    label: 'Verified Business Email',  recommended: true  },
    { id: 'Direct Phone Number',     label: 'Direct / Mobile Phone',    recommended: false },
    { id: 'Personal LinkedIn URL',   label: 'Personal LinkedIn URL',    recommended: false },
  ]},
  { group: 'Company Information', fields: [
    { id: 'Company Name',            label: 'Company Name',             recommended: true  },
    { id: 'Company Website URL',     label: 'Company Website URL',      recommended: false },
    { id: 'Company Industry',        label: 'Industry / Category',      recommended: false },
    { id: 'Company Size',            label: 'Employee Count',           recommended: false },
    { id: 'Company Phone Number',    label: 'Company Phone Number',     recommended: false },
  ]},
  { group: 'Location & Address', fields: [
    { id: 'Full Mailing Address',    label: 'Full Mailing Address',     recommended: false },
    { id: 'City / State / Country',  label: 'City / State / Country',   recommended: false },
  ]},
  { group: 'Social & Advanced', fields: [
    { id: 'Company LinkedIn Page',   label: 'Company LinkedIn Page',    recommended: false },
    { id: 'Social Media Links',      label: 'Other Social Media Links', recommended: false },
    { id: 'Annual Revenue',          label: 'Annual Revenue (approx.)', recommended: false },
  ]},
]

const RECOMMENDED_DEFAULTS = ['First & Last Name', 'Valid Business Email', 'Company Name']

const QTY_PRESETS = [
  { value: '100',    label: '100',    badge: 'Starter'      },
  { value: '250',    label: '250',    badge: 'Popular ★'    },
  { value: '500',    label: '500',    badge: 'Standard'     },
  { value: '1000',   label: '1,000',  badge: 'Professional' },
  { value: 'custom', label: 'Custom', badge: 'Any amount'   },
]

interface OrderResult { orderId: string; quantity: number; clientName: string }

function OrderFormTab({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({
    clientName: '', clientEmail: '',
    leadType:   '' as string,
    industries: [] as string[], customIndustry: '',
    jobTitles:  [] as string[], customJobTitle: '',
    location:   '',
    companySizes: [] as string[],
    dataFields:  RECOMMENDED_DEFAULTS as string[],
    qtyPreset:   '', customQty: '',
    instructions: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [errors,     setErrors]     = useState<string[]>([])
  const [order,      setOrder]      = useState<OrderResult | null>(null)

  function toggle(key: keyof typeof form, val: string) {
    setForm(f => {
      const arr = (f[key] as string[])
      return { ...f, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] }
    })
  }

  const finalQty = form.qtyPreset === 'custom'
    ? parseInt(form.customQty) || 0
    : parseInt(form.qtyPreset) || 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs: string[] = []
    if (!form.clientName.trim())               errs.push('Client name is required')
    if (!form.leadType)                         errs.push('Select a lead type (Section 1)')
    if (!form.industries.length && !form.customIndustry.trim()) errs.push('Select at least one industry (Section 2)')
    if (!form.location.trim())                 errs.push('Target location is required (Section 4)')
    if (!form.dataFields.length)               errs.push('Select at least one data field (Section 6)')
    if (!finalQty)                             errs.push('Select quantity (Section 7)')
    if (errs.length) { setErrors(errs); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setErrors([])
    setSubmitting(true)
    try {
      const res = await fetch('/api/leads/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName:     form.clientName,
          clientEmail:    form.clientEmail || undefined,
          leadType:       form.leadType,
          industries:     form.industries,
          customIndustry: form.customIndustry || undefined,
          jobTitles:      form.jobTitles,
          customJobTitle: form.customJobTitle || undefined,
          location:       form.location,
          companySizes:   form.companySizes,
          dataFields:     form.dataFields,
          quantity:       finalQty,
          instructions:   form.instructions || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Order submission failed')
      setOrder(data)
      onSuccess()
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Something went wrong'])
    } finally { setSubmitting(false) }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (order) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 size={40} className="text-green-500"/>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Received!</h2>
        <p className="text-gray-500 mb-1">Order ID: <span className="font-mono text-xs text-gray-700">{order.orderId}</span></p>
        <p className="text-gray-500 mb-8">
          <strong>{finalQty.toLocaleString()} leads</strong> requested for <strong>{order.clientName}</strong>
        </p>
        <div className="bg-violet-50 rounded-xl p-5 text-left mb-6 space-y-2 text-sm">
          <p><span className="text-gray-500 w-28 inline-block">Lead Type:</span> <span className="font-medium">{form.leadType}</span></p>
          <p><span className="text-gray-500 w-28 inline-block">Industries:</span> <span className="font-medium">{[...form.industries, form.customIndustry].filter(Boolean).join(', ')}</span></p>
          <p><span className="text-gray-500 w-28 inline-block">Location:</span> <span className="font-medium">{form.location}</span></p>
          <p><span className="text-gray-500 w-28 inline-block">Data Fields:</span> <span className="font-medium">{form.dataFields.length} fields selected</span></p>
          <p><span className="text-gray-500 w-28 inline-block">Quantity:</span> <span className="font-medium text-violet-700">{finalQty.toLocaleString()} leads</span></p>
        </div>
        <button
          onClick={() => { setOrder(null); setForm({ clientName:'', clientEmail:'', leadType:'', industries:[], customIndustry:'', jobTitles:[], customJobTitle:'', location:'', companySizes:[], dataFields: RECOMMENDED_DEFAULTS, qtyPreset:'', customQty:'', instructions:'' }) }}
          className="px-6 py-3 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700"
        >
          New Order
        </button>
      </div>
    )
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="flex gap-6 items-start pb-28">
      {/* Left: sections */}
      <div className="flex-1 flex flex-col gap-5 min-w-0">
        {/* Validation errors */}
        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-red-700 mb-1 flex items-center gap-2"><AlertCircle size={15}/> Please fix the following:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {errors.map((e, i) => <li key={i} className="text-sm text-red-600">{e}</li>)}
            </ul>
          </div>
        )}

        {/* Client info */}
        <FormSection num={0} title="Client Information" subtitle="Who is placing this order?" required>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Full Name <span className="text-red-500">*</span></label>
              <input value={form.clientName} onChange={e => setForm(f => ({...f, clientName: e.target.value}))}
                placeholder="e.g. John Smith"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500"/>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Email Address</label>
              <input value={form.clientEmail} onChange={e => setForm(f => ({...f, clientEmail: e.target.value}))}
                type="email" placeholder="client@company.com"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500"/>
            </div>
          </div>
        </FormSection>

        {/* Section 1: Lead Type */}
        <FormSection num={1} title="Type of Lead Generation" subtitle="What kind of leads does your client need?" required>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {LEAD_TYPES.map(t => (
              <button key={t.id} type="button" onClick={() => setForm(f => ({...f, leadType: t.id}))}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                  form.leadType === t.id
                    ? 'border-violet-500 bg-violet-50'
                    : 'border-gray-200 bg-white hover:border-violet-200'
                }`}>
                <span className="text-2xl">{t.icon}</span>
                <div>
                  <p className={`text-sm font-semibold ${form.leadType === t.id ? 'text-violet-700' : 'text-gray-800'}`}>{t.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.sub}</p>
                </div>
                {form.leadType === t.id && <CheckCircle2 size={16} className="text-violet-500 ml-auto shrink-0 mt-0.5"/>}
              </button>
            ))}
          </div>
        </FormSection>

        {/* Section 2: Industry */}
        <FormSection num={2} title="Target Industry / Sector" subtitle="Which industries should the leads come from?" required>
          <div className="flex flex-wrap gap-2">
            {INDUSTRIES.map(ind => (
              <Chip key={ind} label={ind} selected={form.industries.includes(ind)}
                onClick={() => toggle('industries', ind)}/>
            ))}
          </div>
          <div className="mt-3">
            <input value={form.customIndustry} onChange={e => setForm(f => ({...f, customIndustry: e.target.value}))}
              placeholder="Other industry (type here)..."
              className="w-full px-3 py-2.5 text-sm border border-dashed border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-gray-50"/>
          </div>
        </FormSection>

        {/* Section 3: Job Titles */}
        <FormSection num={3} title="Target Job Titles / Positions" subtitle="(B2B) Whose contact information does the client need?">
          <div className="flex flex-wrap gap-2">
            {JOB_TITLES.map(j => (
              <Chip key={j} label={j} selected={form.jobTitles.includes(j)}
                onClick={() => toggle('jobTitles', j)}/>
            ))}
          </div>
          <div className="mt-3">
            <input value={form.customJobTitle} onChange={e => setForm(f => ({...f, customJobTitle: e.target.value}))}
              placeholder="Custom title (e.g. Procurement Manager, VP of Sales)..."
              className="w-full px-3 py-2.5 text-sm border border-dashed border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-gray-50"/>
          </div>
        </FormSection>

        {/* Section 4: Location */}
        <FormSection num={4} title="Target Location" subtitle="Which country, city, or region?" required>
          <input value={form.location} onChange={e => setForm(f => ({...f, location: e.target.value}))}
            placeholder="e.g. USA, United Kingdom, New York City, London, Bangladesh..."
            className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500"/>
        </FormSection>

        {/* Section 5: Company Size */}
        <FormSection num={5} title="Target Company Size" subtitle="How many employees should the companies have?">
          <div className="flex flex-wrap gap-3">
            {COMPANY_SIZES.map(s => (
              <button key={s.id} type="button" onClick={() => toggle('companySizes', s.id)}
                className={`flex flex-col items-center px-5 py-3 rounded-xl border-2 transition-all min-w-[80px] ${
                  form.companySizes.includes(s.id)
                    ? 'border-violet-500 bg-violet-50'
                    : 'border-gray-200 bg-white hover:border-violet-200'
                }`}>
                <span className={`text-sm font-bold ${form.companySizes.includes(s.id) ? 'text-violet-700' : 'text-gray-800'}`}>{s.label}</span>
                <span className="text-xs text-gray-400 mt-0.5">{s.sub}</span>
              </button>
            ))}
          </div>
        </FormSection>

        {/* Section 6: Data Fields */}
        <FormSection num={6} title="Required Data Fields" subtitle="What information should each lead record include?" required>
          <div className="flex flex-col gap-5">
            {DATA_FIELDS.map(group => (
              <div key={group.group}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{group.group}</p>
                <div className="flex flex-wrap gap-2">
                  {group.fields.map(f => (
                    <button key={f.id} type="button" onClick={() => toggle('dataFields', f.id)}
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-full border text-sm font-medium transition-all ${
                        form.dataFields.includes(f.id)
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-violet-300'
                      }`}>
                      {form.dataFields.includes(f.id) && <CheckCircle2 size={12}/>}
                      {f.label}
                      {f.recommended && !form.dataFields.includes(f.id) && (
                        <span className="ml-0.5 text-xs text-green-600 font-semibold">(Rec.)</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
            <span className="text-green-600 font-semibold">(Rec.)</span> = Recommended — pre-selected for every order
          </p>
        </FormSection>

        {/* Section 7: Quantity */}
        <FormSection num={7} title="Quantity of Leads" subtitle="How many lead records does the client need?" required>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {QTY_PRESETS.map(q => (
              <button key={q.value} type="button" onClick={() => setForm(f => ({...f, qtyPreset: q.value}))}
                className={`flex flex-col items-center py-4 rounded-xl border-2 transition-all ${
                  form.qtyPreset === q.value
                    ? 'border-violet-500 bg-violet-50'
                    : 'border-gray-200 bg-white hover:border-violet-200'
                }`}>
                <span className={`text-lg font-bold ${form.qtyPreset === q.value ? 'text-violet-700' : 'text-gray-800'}`}>{q.label}</span>
                <span className={`text-xs mt-0.5 ${q.badge.includes('★') ? 'text-amber-500 font-semibold' : 'text-gray-400'}`}>{q.badge}</span>
              </button>
            ))}
          </div>
          {form.qtyPreset === 'custom' && (
            <div className="mt-3">
              <input type="number" min="1" max="100000" value={form.customQty}
                onChange={e => setForm(f => ({...f, customQty: e.target.value}))}
                placeholder="Enter exact quantity (e.g. 750)"
                className="w-full px-4 py-3 text-sm border-2 border-violet-300 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 font-medium"/>
            </div>
          )}
        </FormSection>

        {/* Section 8: Instructions */}
        <FormSection num={8} title="Additional Instructions" subtitle="Any specific requirements, exclusions, or notes?">
          <textarea value={form.instructions} onChange={e => setForm(f => ({...f, instructions: e.target.value}))}
            rows={4} placeholder="e.g. Only include companies with active websites. No government organizations. Prefer companies that use Shopify or WooCommerce..."
            className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 resize-none"/>
        </FormSection>

      </div>

      {/* Right: sticky summary (desktop only) */}
      <div className="hidden lg:flex flex-col gap-4 w-72 shrink-0 sticky top-6">
        <OrderSummary form={form} finalQty={finalQty}/>
      </div>

      {/* ── Sticky Save bar (always visible, bottom of screen) ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-2xl px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div>
              <p className="text-sm font-semibold text-gray-800">
                {finalQty > 0
                  ? <><span className="text-violet-600">{finalQty.toLocaleString()} leads</span> ready to order</>
                  : 'Fill in the form to place your order'
                }
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {form.dataFields.length > 0
                  ? `${form.dataFields.length} data fields • ${form.industries.length + (form.customIndustry ? 1 : 0)} industries`
                  : 'Select data fields and quantity'
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {errors.length > 0 && (
              <span className="text-sm text-red-500 flex items-center gap-1">
                <AlertCircle size={14}/> {errors.length} issue{errors.length > 1 ? 's' : ''}
              </span>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="px-8 py-3 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 disabled:opacity-60 flex items-center gap-2 text-sm shadow-lg hover:shadow-xl transition-all"
            >
              {submitting
                ? <><Loader2 size={16} className="animate-spin"/> Saving…</>
                : <><CheckCircle2 size={16}/> Save &amp; Submit Order</>
              }
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}

// ── Order Form sub-components ──────────────────────────────────────────────────

function FormSection({ num, title, subtitle, required, children }: {
  num: number; title: string; subtitle: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
          {num === 0 ? '✦' : num}
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
            {title}
            {required && <span className="text-red-500 text-xs">*</span>}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-all ${
        selected
          ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
          : 'bg-white text-gray-700 border-gray-200 hover:border-violet-300 hover:text-violet-700'
      }`}>
      {selected && <span className="mr-1">✓</span>}
      {label}
    </button>
  )
}

function OrderSummary({ form, finalQty }: { form: ReturnType<typeof Object.create>; finalQty: number }) {
  const allIndustries = [...(form.industries as string[]), ...(form.customIndustry ? [form.customIndustry] : [])]
  const allJobTitles  = [...(form.jobTitles  as string[]), ...(form.customJobTitle  ? [form.customJobTitle]  : [])]

  const rows: { label: string; val: string; empty?: boolean }[] = [
    { label: 'Client',      val: form.clientName || '—',                              empty: !form.clientName },
    { label: 'Lead Type',   val: form.leadType   || '—',                              empty: !form.leadType },
    { label: 'Industries',  val: allIndustries.length ? allIndustries.slice(0,2).join(', ') + (allIndustries.length > 2 ? ` +${allIndustries.length - 2}` : '') : '—', empty: !allIndustries.length },
    { label: 'Job Titles',  val: allJobTitles.length  ? `${allJobTitles.length} selected` : 'Any',      empty: false },
    { label: 'Location',    val: form.location   || '—',                              empty: !form.location },
    { label: 'Company Size',val: (form.companySizes as string[]).length ? (form.companySizes as string[]).join(', ') : 'Any', empty: false },
    { label: 'Data Fields', val: (form.dataFields as string[]).length ? `${(form.dataFields as string[]).length} fields` : '—', empty: !(form.dataFields as string[]).length },
    { label: 'Quantity',    val: finalQty ? finalQty.toLocaleString() + ' leads' : '—', empty: !finalQty },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-violet-600 px-4 py-3">
        <h3 className="text-white font-semibold text-sm">Order Summary</h3>
        <p className="text-violet-200 text-xs mt-0.5">Live preview — updates as you fill</p>
      </div>
      <div className="p-4 space-y-3">
        {rows.map(row => (
          <div key={row.label} className="flex justify-between gap-2 text-xs">
            <span className="text-gray-500 shrink-0">{row.label}</span>
            <span className={`font-medium text-right truncate max-w-[150px] ${row.empty ? 'text-gray-300 italic' : 'text-gray-800'}`}>{row.val}</span>
          </div>
        ))}
        {finalQty > 0 && (
          <div className="pt-2 border-t border-gray-100">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-gray-600">Total Leads</span>
              <span className="text-lg font-bold text-violet-600">{finalQty.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Lead Card ─────────────────────────────────────────────────────────────────

function LeadCard({ lead, onImport, onReject }: { lead: Lead; onImport: () => void; onReject: () => void }) {
  const isDemo    = (lead.rawData)?._demo === true
  const isScraped = lead.leadSource?.provider === 'WEB_SCRAPER'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{lead.name}</p>
          {lead.company && lead.company !== lead.name && (
            <p className="text-xs text-gray-500 truncate">{lead.company}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {isDemo    && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">Demo</span>}
          {isScraped && <span className="px-2 py-0.5 bg-violet-100 text-violet-700 text-xs rounded-full font-medium">Scraped</span>}
        </div>
      </div>

      <div className="flex flex-col gap-1 text-xs">
        {lead.email   && <p className="flex items-center gap-1.5 text-blue-600 truncate"><Mail size={11}/> {lead.email}</p>}
        {lead.phone   && <p className="flex items-center gap-1.5 text-green-600"><Phone size={11}/> {lead.phone}</p>}
        {lead.address && <p className="flex items-center gap-1.5 text-gray-500 truncate"><MapPin size={11}/> {lead.address}</p>}
        {lead.website && (
          <a href={lead.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-violet-500 hover:underline truncate">
            <Link2 size={11}/> {lead.website}
          </a>
        )}
      </div>

      {lead.status === 'PENDING' && (
        <div className="flex gap-2 mt-auto pt-1">
          <button onClick={onImport} className="flex-1 px-3 py-2 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 flex items-center justify-center gap-1">
            <CheckCircle2 size={12}/> Import
          </button>
          <button onClick={onReject} className="flex-1 px-3 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-red-50 hover:text-red-600 flex items-center justify-center gap-1">
            <XCircle size={12}/> Reject
          </button>
        </div>
      )}
      {lead.status === 'IMPORTED' && (
        <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium pt-1">
          <CheckCircle2 size={12}/> Imported to Contacts
        </div>
      )}
      {lead.status === 'REJECTED' && (
        <div className="flex items-center gap-1.5 text-xs text-red-400 font-medium pt-1">
          <XCircle size={12}/> Rejected
        </div>
      )}
    </div>
  )
}
