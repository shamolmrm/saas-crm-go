'use client'

import { useState }  from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api }       from '@/lib/api'
import { Plus, ChevronLeft, ChevronRight, Calendar, Clock, MapPin, User, X, CheckCircle } from 'lucide-react'

interface ServiceType { id: string; name: string; durationMinutes: number; color: string; isActive: boolean }
interface Contact     { id: string; name: string; email?: string }
interface Appointment {
  id: string; title: string; startsAt: string; endsAt: string; ianaTz: string
  status: 'SCHEDULED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW'
  notes?: string; location?: string
  contact:      { id: string; name: string } | null
  serviceType:  { id: string; name: string; color: string; durationMinutes: number } | null
  assignedUser: { id: string; name: string } | null
}

const bookingsApi = {
  list:         (from: string, to: string) => api.get<Appointment[]>('/bookings', { params: { from, to } }),
  create:       (d: object)  => api.post<Appointment>('/bookings', d),
  update:       (id: string, d: object) => api.patch(`/bookings/${id}`, d),
  cancel:       (id: string) => api.delete(`/bookings/${id}`),
  serviceTypes: () => api.get<ServiceType[]>('/bookings/service-types'),
  contacts:     () => api.get<{ contacts: Contact[] }>('/contacts'),
}

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-600',
  COMPLETED: 'bg-gray-100 text-gray-600',
  NO_SHOW:   'bg-amber-100 text-amber-700',
}

function getWeekDays(date: Date) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay()) // Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d)
    day.setDate(d.getDate() + i)
    return day
  })
}

export default function BookingsPage() {
  const qc = useQueryClient()
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay())
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [showForm, setShowForm]           = useState(false)
  const [selected, setSelected]           = useState<Appointment | null>(null)
  const [formData, setFormData]           = useState({
    title: '', startsAt: '', endsAt: '', ianaTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    contactId: '', serviceTypeId: '', notes: '', location: '',
  })

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 7)

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments', weekStart.toISOString()],
    queryFn:  () => bookingsApi.list(weekStart.toISOString(), weekEnd.toISOString()).then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: serviceTypes = [] } = useQuery({
    queryKey: ['service-types'],
    queryFn:  () => bookingsApi.serviceTypes().then(r => r.data),
  })

  const { data: contactsData } = useQuery({
    queryKey: ['contacts-for-booking'],
    queryFn:  () => bookingsApi.contacts().then(r => r.data),
  })
  const contacts = contactsData?.contacts ?? []

  const createMut = useMutation({
    mutationFn: () => bookingsApi.create({
      ...formData,
      contactId:     formData.contactId     || undefined,
      serviceTypeId: formData.serviceTypeId || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] })
      setShowForm(false)
      setFormData({ title: '', startsAt: '', endsAt: '', ianaTz: Intl.DateTimeFormat().resolvedOptions().timeZone, contactId: '', serviceTypeId: '', notes: '', location: '' })
    },
  })

  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => bookingsApi.update(id, { status }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['appointments'] }); setSelected(null) },
  })

  const cancelMut = useMutation({
    mutationFn: (id: string) => bookingsApi.cancel(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['appointments'] }); setSelected(null) },
  })

  const days = getWeekDays(weekStart)
  const hours = Array.from({ length: 16 }, (_, i) => i + 7) // 7am–10pm

  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d) }
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d) }

  const apptForSlot = (day: Date, hour: number) =>
    appointments.filter(a => {
      const s = new Date(a.startsAt)
      return s.toDateString() === day.toDateString() && s.getHours() === hour
    })

  const today = new Date().toDateString()
  const DAYS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="border rounded-md p-1.5 hover:bg-muted"><ChevronLeft size={14} /></button>
          <span className="text-sm font-medium min-w-[160px] text-center">
            {days[0].toLocaleDateString([], { month: 'short', day: 'numeric' })} –{' '}
            {days[6].toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button onClick={nextWeek} className="border rounded-md p-1.5 hover:bg-muted"><ChevronRight size={14} /></button>
        </div>
        <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); setWeekStart(d) }}
          className="border rounded-md px-2.5 py-1 text-xs hover:bg-muted"
        >Today</button>
        <div className="ml-auto">
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium"
          ><Plus size={14} /> New appointment</button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-8 min-w-[700px]">
          {/* Time column header */}
          <div className="border-b border-r py-2" />
          {days.map((day, i) => (
            <div key={i} className={`border-b border-r py-2 text-center text-xs font-medium ${day.toDateString() === today ? 'bg-primary/5 text-primary' : 'text-muted-foreground'}`}>
              <div>{DAYS[i]}</div>
              <div className={`text-lg font-semibold mt-0.5 ${day.toDateString() === today ? 'text-primary' : 'text-foreground'}`}>
                {day.getDate()}
              </div>
            </div>
          ))}

          {hours.map(hour => (
            <>
              <div key={`h-${hour}`} className="border-b border-r px-2 py-1 text-right text-xs text-muted-foreground">
                {hour === 12 ? '12pm' : hour > 12 ? `${hour - 12}pm` : `${hour}am`}
              </div>
              {days.map((day, di) => {
                const slotAppts = apptForSlot(day, hour)
                return (
                  <div key={`${hour}-${di}`}
                    className={`border-b border-r min-h-[48px] p-0.5 cursor-pointer hover:bg-muted/30 transition-colors ${day.toDateString() === today ? 'bg-primary/5' : ''}`}
                    onClick={() => {
                      const dt = new Date(day)
                      dt.setHours(hour, 0, 0, 0)
                      const end = new Date(dt)
                      end.setHours(hour + 1)
                      setFormData(f => ({
                        ...f,
                        startsAt: dt.toISOString().slice(0, 16),
                        endsAt:   end.toISOString().slice(0, 16),
                      }))
                      setShowForm(true)
                    }}
                  >
                    {slotAppts.map(appt => (
                      <div key={appt.id}
                        style={{ backgroundColor: appt.serviceType?.color ?? '#6366f1' + '20', borderLeftColor: appt.serviceType?.color ?? '#6366f1' }}
                        className="border-l-2 rounded px-1.5 py-0.5 mb-0.5 cursor-pointer text-xs font-medium truncate"
                        onClick={e => { e.stopPropagation(); setSelected(appt) }}
                      >
                        {appt.title}
                      </div>
                    ))}
                  </div>
                )
              })}
            </>
          ))}
        </div>
      </div>

      {/* New appointment form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">New appointment</h2>
              <button onClick={() => setShowForm(false)}><X size={16} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Title *</label>
                <input value={formData.title} onChange={e => setFormData(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Discovery call with Karim"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Starts at *</label>
                  <input type="datetime-local" value={formData.startsAt}
                    onChange={e => setFormData(f => ({ ...f, startsAt: e.target.value }))}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Ends at *</label>
                  <input type="datetime-local" value={formData.endsAt}
                    onChange={e => setFormData(f => ({ ...f, endsAt: e.target.value }))}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Contact</label>
                  <select value={formData.contactId} onChange={e => setFormData(f => ({ ...f, contactId: e.target.value }))}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">— none —</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Service type</label>
                  <select value={formData.serviceTypeId} onChange={e => setFormData(f => ({ ...f, serviceTypeId: e.target.value }))}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">— none —</option>
                    {serviceTypes.filter(s => s.isActive).map(s => <option key={s.id} value={s.id}>{s.name} ({s.durationMinutes}min)</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Location</label>
                <input value={formData.location} onChange={e => setFormData(f => ({ ...f, location: e.target.value }))}
                  placeholder="Zoom / Office / Phone"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Notes</label>
                <textarea value={formData.notes} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                  rows={2} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="border rounded-md px-3 py-2 text-sm hover:bg-muted">Cancel</button>
              <button
                onClick={() => createMut.mutate()}
                disabled={!formData.title || !formData.startsAt || !formData.endsAt || createMut.isPending}
                className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
              >{createMut.isPending ? 'Saving…' : 'Save appointment'}</button>
            </div>
            {createMut.isError && (
              <p className="text-destructive text-xs mt-2">
                {((createMut.error as { response?: { data?: { error?: string } } })?.response?.data?.error) ?? 'Failed to create appointment'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Appointment detail panel */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold truncate pr-2">{selected.title}</h2>
              <button onClick={() => setSelected(null)}><X size={16} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-2 text-sm mb-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar size={13} />
                <span>{new Date(selected.startsAt).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock size={13} />
                <span>
                  {new Date(selected.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                  {new Date(selected.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' '}({selected.ianaTz})
                </span>
              </div>
              {selected.contact && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User size={13} /> <span>{selected.contact.name}</span>
                </div>
              )}
              {selected.location && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin size={13} /> <span>{selected.location}</span>
                </div>
              )}
              {selected.notes && <p className="text-muted-foreground pt-1 border-t">{selected.notes}</p>}
              <div className="pt-1">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[selected.status]}`}>
                  {selected.status.replace('_', ' ').toLowerCase()}
                </span>
              </div>
            </div>
            {selected.status === 'SCHEDULED' && (
              <div className="flex gap-2">
                <button onClick={() => updateStatusMut.mutate({ id: selected.id, status: 'CONFIRMED' })}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 text-white rounded-md px-3 py-2 text-sm font-medium hover:bg-green-700"
                ><CheckCircle size={13} /> Confirm</button>
                <button onClick={() => { if (confirm('Cancel this appointment?')) cancelMut.mutate(selected.id) }}
                  className="border rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:border-destructive"
                >Cancel</button>
              </div>
            )}
            {selected.status === 'CONFIRMED' && (
              <div className="flex gap-2">
                <button onClick={() => updateStatusMut.mutate({ id: selected.id, status: 'COMPLETED' })}
                  className="flex-1 border rounded-md px-3 py-2 text-sm hover:bg-muted"
                >Mark completed</button>
                <button onClick={() => updateStatusMut.mutate({ id: selected.id, status: 'NO_SHOW' })}
                  className="border rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
                >No-show</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
