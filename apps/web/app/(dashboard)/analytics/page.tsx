'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { BarChart2, TrendingUp, DollarSign, LifeBuoy, Target, Users, Sparkles, ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface SummaryData {
  kpis: { contacts: number; totalDealValue: number; wonDeals: number; openDeals: number; openTickets: number; revenue: number; pendingLeads: number; activeProjects: number }
  pipeline: Record<string, number>
}
interface RevenuePoint { month: string; revenue: number; invoices: number }
interface PipelineRow  { stage: string; count: number; value: number }
interface TicketRow    { status: string; count: number }

const STAGE_COLOR: Record<string, string> = {
  LEAD: '#94A3B8', QUALIFIED: '#60A5FA', PROPOSAL: '#A78BFA',
  NEGOTIATION: '#FBBF24', WON: '#34D399', LOST: '#F87171',
}
const STATUS_COLOR: Record<string, string> = {
  OPEN: '#F87171', IN_PROGRESS: '#FBBF24', WAITING: '#60A5FA',
  RESOLVED: '#34D399', CLOSED: '#94A3B8',
}

export default function AnalyticsPage() {
  const [summary,  setSummary]  = useState<SummaryData | null>(null)
  const [revenue,  setRevenue]  = useState<RevenuePoint[]>([])
  const [pipeline, setPipeline] = useState<PipelineRow[]>([])
  const [tickets,  setTickets]  = useState<TicketRow[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<SummaryData>('/analytics/summary'),
      api.get<RevenuePoint[]>('/analytics/revenue'),
      api.get<PipelineRow[]>('/analytics/pipeline'),
      api.get<TicketRow[]>('/analytics/tickets'),
    ]).then(([s, r, p, t]) => {
      setSummary(s.data); setRevenue(r.data); setPipeline(p.data); setTickets(t.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin"/>
    </div>
  )

  const k       = summary?.kpis
  const maxRev  = Math.max(...revenue.map(r => r.revenue), 1)
  const maxPipe = Math.max(...pipeline.map(p => p.count), 1)
  const maxTkt  = Math.max(...tickets.map(t => t.count), 1)
  const totalRev = revenue.reduce((s, r) => s + r.revenue, 0)
  const prevTotalRev = revenue.slice(0, 3).reduce((s, r) => s + r.revenue, 0)
  const curTotalRev  = revenue.slice(3).reduce((s, r) => s + r.revenue, 0)
  const revGrowth    = prevTotalRev > 0 ? ((curTotalRev - prevTotalRev) / prevTotalRev) * 100 : 0

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart2 size={20} className="text-violet-500"/> Analytics
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">Business performance across all modules</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue',    value: `$${((k?.revenue ?? 0)/1000).toFixed(1)}k`,   icon: DollarSign, color: 'emerald' },
          { label: 'Open Deals',       value: k?.openDeals ?? 0,                             icon: TrendingUp, color: 'violet' },
          { label: 'Total Contacts',   value: k?.contacts ?? 0,                              icon: Users,      color: 'blue'   },
          { label: 'Open Tickets',     value: k?.openTickets ?? 0,                           icon: LifeBuoy,   color: 'rose'   },
        ].map(c => {
          const IC = c.icon
          const colorBg: Record<string, string> = { emerald: 'bg-emerald-50 text-emerald-600', violet: 'bg-violet-50 text-violet-600', blue: 'bg-blue-50 text-blue-600', rose: 'bg-rose-50 text-rose-600' }
          return (
            <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 ${colorBg[c.color]}`}>
                <IC size={15}/>
              </div>
              <p className="text-2xl font-bold text-gray-900">{c.value}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{c.label}</p>
            </div>
          )
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Revenue bar chart */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-800">Revenue (Last 6 months)</h2>
              <p className="text-[11px] text-gray-400">Total: ${totalRev.toLocaleString()}</p>
            </div>
            <div className={`flex items-center gap-1 text-xs font-semibold ${revGrowth >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {revGrowth >= 0 ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>}
              {Math.abs(revGrowth).toFixed(1)}% vs prev 3m
            </div>
          </div>
          <div className="flex items-end gap-2 h-40">
            {revenue.map(r => (
              <div key={r.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] text-gray-500 font-medium">{r.revenue > 0 ? `$${(r.revenue/1000).toFixed(1)}k` : ''}</span>
                <div className="w-full rounded-t-md bg-violet-500 transition-all duration-700"
                  style={{ height: `${(r.revenue / maxRev) * 120}px`, minHeight: r.revenue > 0 ? '4px' : '2px', opacity: r.revenue === 0 ? 0.15 : 1 }}/>
                <span className="text-[10px] text-gray-400">{r.month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline funnel */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-gray-800">Pipeline Funnel</h2>
            <p className="text-[11px] text-gray-400">Total pipeline value: ${(pipeline.reduce((s,p) => s+p.value, 0)/1000).toFixed(1)}k</p>
          </div>
          <div className="space-y-2.5">
            {pipeline.filter(p => p.count > 0 || ['LEAD','WON'].includes(p.stage)).map(p => (
              <div key={p.stage} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: STAGE_COLOR[p.stage] }}/>
                <span className="text-[12px] text-gray-500 w-24 shrink-0 capitalize">{p.stage.charAt(0) + p.stage.slice(1).toLowerCase()}</span>
                <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${(p.count / maxPipe) * 100}%`, backgroundColor: STAGE_COLOR[p.stage] }}/>
                </div>
                <span className="text-[11px] font-semibold text-gray-700 w-8 text-right">{p.count}</span>
                <span className="text-[10px] text-gray-400 w-16 text-right">${(p.value/1000).toFixed(1)}k</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Ticket status */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <LifeBuoy size={14} className="text-rose-500"/> Support Tickets by Status
          </h2>
          <div className="space-y-2.5">
            {tickets.map(t => (
              <div key={t.status} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[t.status] }}/>
                <span className="text-[12px] text-gray-500 w-28 shrink-0">{t.status.replace('_', ' ')}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${(t.count / maxTkt) * 100}%`, backgroundColor: STATUS_COLOR[t.status] }}/>
                </div>
                <span className="text-[12px] font-semibold text-gray-700 w-6 text-right">{t.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI Insights CTA */}
        <div className="bg-gradient-to-br from-violet-600 to-violet-800 rounded-xl p-5 text-white flex flex-col justify-between">
          <div>
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center mb-3">
              <Sparkles size={18} className="text-white"/>
            </div>
            <h2 className="font-bold text-lg mb-1">AI Analytics</h2>
            <p className="text-violet-200 text-sm leading-relaxed">
              Get AI-generated insights, revenue forecasts, churn predictions, and deal win probability scores based on your CRM data.
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="bg-white/20 text-white/90 text-xs font-semibold px-2.5 py-1 rounded-full border border-white/20">
              Coming in v2
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
