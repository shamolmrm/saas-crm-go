'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Link from 'next/link'
import { Activity, Phone, Mail, MessageSquare, Calendar, DollarSign, Users, Clock, ArrowRight } from 'lucide-react'

interface ActivityItem {
  id: string; type: string; title: string; subtitle?: string
  href: string; time: string; icon: string
}

function timeAgo(s: string) {
  const d = (Date.now() - new Date(s).getTime()) / 1000
  if (d < 60)  return 'just now'
  if (d < 3600) return `${Math.floor(d/60)}m ago`
  if (d < 86400) return `${Math.floor(d/3600)}h ago`
  return `${Math.floor(d/86400)}d ago`
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  contact: <Users size={13} className="text-blue-500"/>,
  deal:    <DollarSign size={13} className="text-violet-500"/>,
  ticket:  <MessageSquare size={13} className="text-rose-500"/>,
  invoice: <Mail size={13} className="text-emerald-500"/>,
  call:    <Phone size={13} className="text-amber-500"/>,
  booking: <Calendar size={13} className="text-indigo-500"/>,
}
const TYPE_BG: Record<string, string> = {
  contact: 'bg-blue-50', deal: 'bg-violet-50', ticket: 'bg-rose-50',
  invoice: 'bg-emerald-50', call: 'bg-amber-50', booking: 'bg-indigo-50',
}

export default function ActivitiesPage() {
  const [items,   setItems]   = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Pull recent items from multiple endpoints
    Promise.allSettled([
      api.get<{ data: { id: string; name: string; company?: string; createdAt: string }[] }>('/contacts?limit=10&sort=createdAt'),
      api.get<{ data: { id: string; title: string; stage: string; updatedAt: string }[] }>('/deals?limit=10&sort=updatedAt'),
      api.get<{ data: { id: string; subject: string; status: string; createdAt: string }[] }>('/tickets?limit=10&sort=createdAt'),
      api.get<{ data: { id: string; number: string; status: string; createdAt: string }[] }>('/invoices?limit=10&sort=createdAt'),
    ]).then(results => {
      const all: ActivityItem[] = []

      if (results[0].status === 'fulfilled')
        results[0].value.data.data?.forEach(c => all.push({
          id: `c-${c.id}`, type: 'contact', icon: 'contact',
          title: `New contact: ${c.name}`, subtitle: c.company,
          href: `/contacts/${c.id}`, time: c.createdAt,
        }))

      if (results[1].status === 'fulfilled')
        results[1].value.data.data?.forEach(d => all.push({
          id: `d-${d.id}`, type: 'deal', icon: 'deal',
          title: `Deal updated: ${d.title}`, subtitle: d.stage.charAt(0) + d.stage.slice(1).toLowerCase(),
          href: '/deals', time: d.updatedAt,
        }))

      if (results[2].status === 'fulfilled')
        results[2].value.data.data?.forEach(t => all.push({
          id: `t-${t.id}`, type: 'ticket', icon: 'ticket',
          title: `Ticket: ${t.subject}`, subtitle: t.status,
          href: `/tickets/${t.id}`, time: t.createdAt,
        }))

      if (results[3].status === 'fulfilled')
        results[3].value.data.data?.forEach(i => all.push({
          id: `i-${i.id}`, type: 'invoice', icon: 'invoice',
          title: `Invoice #${i.number}`, subtitle: i.status,
          href: `/invoices/${i.id}`, time: i.createdAt,
        }))

      all.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      setItems(all)
    }).finally(() => setLoading(false))
  }, [])

  // Group by day
  const grouped = items.reduce((acc, item) => {
    const day = new Date(item.time).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    if (!acc[day]) acc[day] = []
    acc[day].push(item)
    return acc
  }, {} as Record<string, ActivityItem[]>)

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Activity size={20} className="text-emerald-500"/> Activity Feed
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">Recent changes across all CRM modules</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading activity…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Activity size={36} className="text-gray-200 mx-auto mb-3"/>
          <p className="text-gray-400 text-sm">No activity yet — add contacts, deals, or tickets to see updates here</p>
        </div>
      ) : (
        Object.entries(grouped).map(([day, dayItems]) => (
          <div key={day}>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{day}</p>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
              {dayItems.map(item => (
                <Link key={item.id} href={item.href}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${TYPE_BG[item.icon] || 'bg-gray-50'}`}>
                    {TYPE_ICONS[item.icon] || <Clock size={13}/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-800 truncate group-hover:text-violet-700">{item.title}</p>
                    {item.subtitle && <p className="text-[11px] text-gray-400 capitalize">{item.subtitle.toLowerCase().replace('_',' ')}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-gray-400">{timeAgo(item.time)}</span>
                    <ArrowRight size={11} className="text-gray-200 group-hover:text-violet-400 transition-colors"/>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
