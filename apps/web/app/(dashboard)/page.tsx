'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import {
  Users, DollarSign, LifeBuoy, TrendingUp, Target, FolderKanban,
  Package, CalendarCheck, ArrowUpRight, ArrowRight, Sparkles,
  Clock, CheckCircle2, AlertCircle, BarChart2, Zap,
} from 'lucide-react'

interface Summary {
  kpis: {
    contacts: number; totalDealValue: number; wonDeals: number
    openDeals: number; openTickets: number; revenue: number
    pendingLeads: number; activeProjects: number; lowStockItems: number; leaveRequests: number
  }
  pipeline: Record<string, number>
  recentContacts: { id: string; name: string; company?: string; createdAt: string }[]
  recentDeals: { id: string; title: string; value: number; stage: string; updatedAt: string }[]
}

const STAGE_COLORS: Record<string, string> = {
  LEAD: 'bg-gray-400', QUALIFIED: 'bg-blue-400', PROPOSAL: 'bg-violet-400',
  NEGOTIATION: 'bg-amber-400', WON: 'bg-emerald-500', LOST: 'bg-red-400',
}
const STAGE_LABEL: Record<string, string> = {
  LEAD: 'Lead', QUALIFIED: 'Qualified', PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation', WON: 'Won', LOST: 'Lost',
}

export default function DashboardPage() {
  const [data,    setData]    = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<Summary>('/analytics/summary')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3 text-gray-400">
        <div className="w-8 h-8 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin"/>
        <p className="text-sm">Loading dashboard…</p>
      </div>
    </div>
  )

  const k = data?.kpis
  const totalPipeline = Object.values(data?.pipeline ?? {}).reduce((a, b) => a + b, 0)

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">Welcome back — here's what's happening today</p>
        </div>
        <Link href="/analytics" className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 font-medium">
          Full analytics <ArrowRight size={14}/>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={<Users size={16}/>}     label="Total Contacts"  value={k?.contacts ?? 0}        color="blue"   href="/contacts"/>
        <KpiCard icon={<DollarSign size={16}/>} label="Pipeline Value"  value={`$${((k?.totalDealValue ?? 0)/1000).toFixed(1)}k`} color="violet" href="/deals"/>
        <KpiCard icon={<BarChart2 size={16}/>}  label="Revenue (Paid)"  value={`$${((k?.revenue ?? 0)/1000).toFixed(1)}k`}        color="emerald" href="/invoices"/>
        <KpiCard icon={<LifeBuoy size={16}/>}   label="Open Tickets"    value={k?.openTickets ?? 0}     color="rose"   href="/tickets"/>
      </div>

      {/* Second row KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={<Target size={16}/>}        label="Pending Leads"    value={k?.pendingLeads ?? 0}    color="amber"  href="/leads" small/>
        <KpiCard icon={<FolderKanban size={16}/>}  label="Active Projects"  value={k?.activeProjects ?? 0}  color="indigo" href="/projects" small/>
        <KpiCard icon={<Package size={16}/>}       label="Low Stock Items"  value={k?.lowStockItems ?? 0}   color="orange" href="/inventory" small/>
        <KpiCard icon={<CalendarCheck size={16}/>} label="Leave Requests"   value={k?.leaveRequests ?? 0}   color="teal"   href="/hr" small/>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Pipeline funnel */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <TrendingUp size={15} className="text-violet-500"/> Sales Pipeline
            </h2>
            <Link href="/deals" className="text-xs text-violet-600 hover:underline flex items-center gap-1">
              View all <ArrowUpRight size={11}/>
            </Link>
          </div>
          <div className="space-y-2.5">
            {['LEAD','QUALIFIED','PROPOSAL','NEGOTIATION','WON','LOST'].map(stage => {
              const count = data?.pipeline[stage] ?? 0
              const pct   = totalPipeline ? Math.round((count / totalPipeline) * 100) : 0
              return (
                <div key={stage} className="flex items-center gap-3">
                  <span className="text-[11px] text-gray-500 w-24 shrink-0">{STAGE_LABEL[stage]}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${STAGE_COLORS[stage]}`} style={{ width: `${pct}%` }}/>
                  </div>
                  <span className="text-[11px] font-semibold text-gray-700 w-6 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Zap size={15} className="text-amber-500"/> Quick Actions
          </h2>
          <div className="space-y-2">
            {[
              { label: 'Add Contact',      href: '/contacts/new', icon: <Users size={13}/>, color: 'text-blue-600 bg-blue-50 hover:bg-blue-100' },
              { label: 'New Deal',         href: '/deals',        icon: <DollarSign size={13}/>, color: 'text-violet-600 bg-violet-50 hover:bg-violet-100' },
              { label: 'Generate Leads',   href: '/leads',        icon: <Target size={13}/>, color: 'text-rose-600 bg-rose-50 hover:bg-rose-100' },
              { label: 'Create Invoice',   href: '/invoices',     icon: <BarChart2 size={13}/>, color: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' },
              { label: 'New Workflow',     href: '/workflows',    icon: <Zap size={13}/>, color: 'text-amber-600 bg-amber-50 hover:bg-amber-100' },
              { label: 'AI Copilot',       href: '/ai/copilot',   icon: <Sparkles size={13}/>, color: 'text-violet-600 bg-violet-50 hover:bg-violet-100' },
            ].map(a => (
              <Link key={a.href} href={a.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${a.color}`}>
                {a.icon} {a.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Recent Contacts */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Users size={15} className="text-blue-500"/> Recent Contacts
            </h2>
            <Link href="/contacts" className="text-xs text-violet-600 hover:underline">View all</Link>
          </div>
          {data?.recentContacts.length === 0 ? (
            <EmptyState msg="No contacts yet" href="/contacts/new" action="Add first contact"/>
          ) : (
            <div className="space-y-2.5">
              {(data?.recentContacts ?? []).map(c => (
                <Link key={c.id} href={`/contacts/${c.id}`}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors group">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-[11px] font-bold text-blue-600 shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-800 truncate group-hover:text-violet-700">{c.name}</p>
                    {c.company && <p className="text-[11px] text-gray-400 truncate">{c.company}</p>}
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(c.createdAt)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Deals */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <DollarSign size={15} className="text-violet-500"/> Recent Deals
            </h2>
            <Link href="/deals" className="text-xs text-violet-600 hover:underline">View all</Link>
          </div>
          {data?.recentDeals.length === 0 ? (
            <EmptyState msg="No deals yet" href="/deals" action="Create first deal"/>
          ) : (
            <div className="space-y-2.5">
              {(data?.recentDeals ?? []).map(d => (
                <div key={d.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${STAGE_COLORS[d.stage] || 'bg-gray-400'}`}/>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-800 truncate">{d.title}</p>
                    <p className="text-[11px] text-gray-400">{STAGE_LABEL[d.stage]}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[12px] font-semibold text-gray-800">${Number(d.value).toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400">{timeAgo(d.updatedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, color, href, small }: {
  icon: React.ReactNode; label: string; value: string | number
  color: string; href: string; small?: boolean
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', violet: 'bg-violet-50 text-violet-600',
    emerald: 'bg-emerald-50 text-emerald-600', rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600', indigo: 'bg-indigo-50 text-indigo-600',
    orange: 'bg-orange-50 text-orange-600', teal: 'bg-teal-50 text-teal-600',
  }
  return (
    <Link href={href} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-violet-200 hover:shadow-md transition-all group">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colorMap[color]}`}>{icon}</div>
        <ArrowUpRight size={13} className="text-gray-300 group-hover:text-violet-400 transition-colors"/>
      </div>
      <p className={`font-bold text-gray-900 ${small ? 'text-xl' : 'text-2xl'}`}>{value}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
    </Link>
  )
}

function EmptyState({ msg, href, action }: { msg: string; href: string; action: string }) {
  return (
    <div className="text-center py-6">
      <p className="text-sm text-gray-400 mb-2">{msg}</p>
      <Link href={href} className="text-xs text-violet-600 hover:underline font-medium">{action}</Link>
    </div>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
