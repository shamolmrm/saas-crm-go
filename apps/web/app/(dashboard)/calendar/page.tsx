'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight, CalendarCheck, Clock } from 'lucide-react'

interface Booking {
  id: string; title: string; startTime: string; endTime: string; status: string
  contact?: { name: string }
}

const DAYS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function CalendarPage() {
  const [bookings,     setBookings]     = useState<Booking[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    api.get<{ data: Booking[] }>('/bookings?limit=100')
      .then(r => setBookings(r.data.data ?? []))
      .catch(() => {}).finally(() => setLoading(false))
  }, [])

  const year  = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const first = new Date(year, month, 1).getDay()
  const days  = new Date(year, month + 1, 0).getDate()

  function bookingsOn(day: number) {
    return bookings.filter(b => {
      const d = new Date(b.startTime)
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
    })
  }

  const today     = new Date()
  const isToday   = (d: number) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  const upcoming = bookings
    .filter(b => new Date(b.startTime) >= today)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 8)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <CalendarDays size={20} className="text-indigo-500"/> Calendar
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">View and manage appointments &amp; bookings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Calendar grid */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
              <ChevronLeft size={16}/>
            </button>
            <h2 className="font-semibold text-gray-800">{MONTHS[month]} {year}</h2>
            <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
              <ChevronRight size={16}/>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[11px] font-semibold text-gray-400 py-1">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: first }, (_, i) => (
              <div key={`blank-${i}`}/>
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day  = i + 1
              const bks  = bookingsOn(day)
              const bold = isToday(day)
              return (
                <div key={day}
                  className={`aspect-square flex flex-col items-center justify-start p-1 rounded-lg cursor-pointer hover:bg-gray-50 transition-all ${bold ? 'bg-violet-600 text-white hover:bg-violet-700' : ''}`}>
                  <span className={`text-[12px] font-medium ${bold ? 'text-white' : 'text-gray-700'}`}>{day}</span>
                  <div className="flex flex-wrap gap-0.5 mt-0.5 justify-center">
                    {bks.slice(0, 2).map((_, j) => (
                      <div key={j} className={`w-1 h-1 rounded-full ${bold ? 'bg-violet-200' : 'bg-indigo-400'}`}/>
                    ))}
                    {bks.length > 2 && <span className={`text-[8px] ${bold ? 'text-violet-200' : 'text-gray-400'}`}>+{bks.length-2}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Upcoming appointments */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <CalendarCheck size={14} className="text-indigo-500"/> Upcoming
          </h2>
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
          ) : upcoming.length === 0 ? (
            <div className="text-center py-8">
              <CalendarDays size={28} className="text-gray-200 mx-auto mb-2"/>
              <p className="text-sm text-gray-400 mb-3">No upcoming bookings</p>
              <Link href="/bookings" className="text-sm text-violet-600 hover:underline">Schedule one →</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map(b => {
                const start = new Date(b.startTime)
                const end   = new Date(b.endTime)
                return (
                  <Link key={b.id} href="/bookings"
                    className="block p-3 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/40 transition-all group">
                    <p className="text-[13px] font-semibold text-gray-800 group-hover:text-indigo-700 truncate">{b.title}</p>
                    {b.contact && <p className="text-[11px] text-gray-400 mt-0.5">{b.contact.name}</p>}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Clock size={10} className="text-gray-400"/>
                      <span className="text-[11px] text-gray-500">
                        {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}–{end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className={`mt-1.5 w-fit px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${b.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                      {b.status}
                    </div>
                  </Link>
                )
              })}
              <Link href="/bookings" className="block text-center text-xs text-violet-600 hover:underline pt-1">View all bookings →</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
