'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Building2, Plus, Search, Globe, Users, Phone, MapPin, ExternalLink } from 'lucide-react'

interface Company {
  id: string; name: string; domain?: string; industry?: string
  size?: string; phone?: string; address?: string
  contactCount?: number; createdAt: string
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [query,     setQuery]     = useState('')
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    // Derive unique companies from contacts
    api.get<{ data: { company?: string; phone?: string }[] }>('/contacts?limit=500')
      .then(r => {
        const seen = new Map<string, Company>()
        r.data.data?.forEach((c: { id?: string; company?: string; phone?: string }) => {
          if (!c.company) return
          const key = c.company.toLowerCase().trim()
          if (!seen.has(key)) {
            seen.set(key, {
              id: key, name: c.company, phone: c.phone,
              contactCount: 1, createdAt: new Date().toISOString(),
            })
          } else {
            seen.get(key)!.contactCount = (seen.get(key)!.contactCount ?? 0) + 1
          }
        })
        setCompanies(Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name)))
      }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const filtered = companies.filter(c =>
    !query || c.name.toLowerCase().includes(query.toLowerCase())
  )

  const initials = (name: string) => name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()

  const COLORS = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-rose-500','bg-amber-500','bg-indigo-500','bg-teal-500']
  const color  = (name: string) => COLORS[name.charCodeAt(0) % COLORS.length]

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 size={20} className="text-blue-500"/> Companies
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{companies.length} companies derived from contacts</p>
        </div>
        <Link href="/contacts/new"
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <Plus size={14}/> Add Contact
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search companies…"
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all"/>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Building2 size={36} className="text-gray-200 mx-auto mb-3"/>
          <p className="text-gray-400 text-sm">{query ? 'No companies match your search' : 'No companies yet — add contacts with company names'}</p>
          <Link href="/contacts/new" className="mt-3 inline-block text-sm text-violet-600 hover:underline">
            Add first contact
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(co => (
            <div key={co.id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-violet-200 hover:shadow-md transition-all group">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 ${color(co.name)}`}>
                  {initials(co.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 truncate">{co.name}</h3>
                  {co.industry && <p className="text-[11px] text-gray-400">{co.industry}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                {co.phone && (
                  <div className="flex items-center gap-2 text-[12px] text-gray-500">
                    <Phone size={11} className="text-gray-300 shrink-0"/> {co.phone}
                  </div>
                )}
                {co.domain && (
                  <div className="flex items-center gap-2 text-[12px] text-gray-500">
                    <Globe size={11} className="text-gray-300 shrink-0"/> {co.domain}
                  </div>
                )}
                {co.address && (
                  <div className="flex items-center gap-2 text-[12px] text-gray-500">
                    <MapPin size={11} className="text-gray-300 shrink-0"/> {co.address}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                  <Users size={11}/> {co.contactCount} contact{(co.contactCount ?? 0) !== 1 ? 's' : ''}
                </div>
                <Link href={`/contacts?company=${encodeURIComponent(co.name)}`}
                  className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px] text-violet-600 hover:underline transition-opacity">
                  View contacts <ExternalLink size={10}/>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info notice */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
        <strong>Note:</strong> Companies are automatically derived from your contacts' company field. A dedicated Company module with custom fields, notes, and deal tracking will be available in v2.
      </div>
    </div>
  )
}
