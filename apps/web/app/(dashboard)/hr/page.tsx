'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api }      from '@/lib/api'
import { Users, Plus, FileText, DollarSign, Calendar, CheckCircle, XCircle, Clock, X } from 'lucide-react'

interface Employee {
  id: string; jobTitle?: string; department?: string; employmentType: string; leaveBalance: number
  user: { id: string; name: string; email: string; avatarUrl?: string }
}

interface LeaveRequest {
  id: string; type: string; status: string; startDate: string; endDate: string; days: number; reason?: string
}

interface SalaryRecord {
  id: string; effectiveDate: string; amount: number; currency: string; note?: string
}

const EMP_TYPE_COLOR: Record<string, string> = {
  FULL_TIME: 'bg-green-100 text-green-700',
  PART_TIME: 'bg-blue-100 text-blue-700',
  CONTRACT:  'bg-amber-100 text-amber-700',
  INTERN:    'bg-purple-100 text-purple-700',
}

const LEAVE_STATUS_COLOR: Record<string, string> = {
  PENDING:   'bg-amber-100 text-amber-700',
  APPROVED:  'bg-green-100 text-green-700',
  REJECTED:  'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
}

export default function HrPage() {
  const qc = useQueryClient()
  const [selected, setSelected]   = useState<Employee | null>(null)
  const [panel, setPanel]         = useState<'leaves' | 'salary'>('leaves')
  const [showLeave, setShowLeave] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ type: 'ANNUAL', startDate: '', endDate: '', days: '1', reason: '' })

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn:  () => api.get<Employee[]>('/hr/employees').then(r => r.data),
  })

  const { data: leaves = [] } = useQuery({
    queryKey: ['employee-leaves', selected?.id],
    queryFn:  () => selected ? api.get<LeaveRequest[]>(`/hr/employees/${selected.id}/leaves`).then(r => r.data) : [],
    enabled:  !!selected && panel === 'leaves',
  })

  const { data: salaries = [] } = useQuery({
    queryKey: ['employee-salary', selected?.id],
    queryFn:  () => selected ? api.get<SalaryRecord[]>(`/hr/employees/${selected.id}/salary`).then(r => r.data) : [],
    enabled:  !!selected && panel === 'salary',
  })

  const reviewMut = useMutation({
    mutationFn: ({ leaveId, status }: { leaveId: string; status: string }) =>
      api.post(`/hr/leaves/${leaveId}/review`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-leaves', selected?.id] })
      qc.invalidateQueries({ queryKey: ['employees'] })
    },
  })

  const requestLeaveMut = useMutation({
    mutationFn: () => selected ? api.post(`/hr/employees/${selected.id}/leaves`, {
      type:      leaveForm.type,
      startDate: new Date(leaveForm.startDate).toISOString(),
      endDate:   new Date(leaveForm.endDate).toISOString(),
      days:      Number(leaveForm.days),
      reason:    leaveForm.reason || undefined,
    }) : Promise.reject(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-leaves', selected?.id] })
      setShowLeave(false)
    },
  })

  return (
    <div className="flex h-full">
      {/* Employee list */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b px-6 py-4 flex items-center gap-4 shrink-0">
          <h1 className="text-xl font-semibold flex items-center gap-2"><Users size={18} /> HR</h1>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : employees.length === 0 ? (
            <div className="p-12 text-center">
              <Users size={32} className="text-muted-foreground mx-auto mb-3" />
              <h2 className="font-medium mb-1">No employees yet</h2>
              <p className="text-muted-foreground text-sm">Employees are added by an admin in Settings.</p>
            </div>
          ) : (
            <div className="divide-y">
              {employees.map(emp => (
                <button key={emp.id} onClick={() => { setSelected(emp); setPanel('leaves') }}
                  className={`w-full text-left px-5 py-3 hover:bg-muted/30 transition-colors flex items-center gap-3 ${selected?.id === emp.id ? 'bg-primary/5' : ''}`}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                    {emp.user.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{emp.user.name}</p>
                    <p className="text-xs text-muted-foreground">{emp.jobTitle ?? emp.user.email}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${EMP_TYPE_COLOR[emp.employmentType]}`}>{emp.employmentType.replace('_', ' ')}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{Number(emp.leaveBalance).toFixed(1)}d leave</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      {selected && (
        <div className="w-80 border-l flex flex-col shrink-0">
          <div className="border-b px-4 py-3 flex items-center justify-between shrink-0">
            <div>
              <p className="font-semibold text-sm">{selected.user.name}</p>
              <p className="text-xs text-muted-foreground">{selected.department ?? 'No department'} · {Number(selected.leaveBalance).toFixed(1)}d left</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
          </div>

          {/* Sub-tabs */}
          <div className="flex border-b shrink-0">
            {(['leaves', 'salary'] as const).map(p => (
              <button key={p} onClick={() => setPanel(p)}
                className={`flex-1 py-2 text-xs font-medium ${panel === p ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >{p === 'leaves' ? 'Leave requests' : 'Salary history'}</button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-3 space-y-2">
            {panel === 'leaves' && (
              <>
                <button onClick={() => setShowLeave(true)}
                  className="w-full border border-dashed rounded-md py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 flex items-center justify-center gap-1"
                ><Plus size={11} /> Request leave</button>
                {leaves.map(l => (
                  <div key={l.id} className="border rounded-md p-2.5 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{l.type}</span>
                      <span className={`px-1.5 py-0.5 rounded-full ${LEAVE_STATUS_COLOR[l.status]}`}>{l.status}</span>
                    </div>
                    <p className="text-muted-foreground">{new Date(l.startDate).toLocaleDateString()} — {new Date(l.endDate).toLocaleDateString()} ({l.days}d)</p>
                    {l.reason && <p className="text-muted-foreground mt-1 italic">{l.reason}</p>}
                    {l.status === 'PENDING' && (
                      <div className="flex gap-1.5 mt-2">
                        <button onClick={() => reviewMut.mutate({ leaveId: l.id, status: 'APPROVED' })}
                          className="flex-1 flex items-center justify-center gap-1 bg-green-50 text-green-700 border border-green-200 rounded py-1 hover:bg-green-100"
                        ><CheckCircle size={11} /> Approve</button>
                        <button onClick={() => reviewMut.mutate({ leaveId: l.id, status: 'REJECTED' })}
                          className="flex-1 flex items-center justify-center gap-1 bg-red-50 text-red-600 border border-red-200 rounded py-1 hover:bg-red-100"
                        ><XCircle size={11} /> Reject</button>
                      </div>
                    )}
                  </div>
                ))}
                {leaves.length === 0 && <p className="text-xs text-muted-foreground text-center pt-4">No leave requests.</p>}
              </>
            )}

            {panel === 'salary' && (
              <>
                {salaries.map(s => (
                  <div key={s.id} className="border rounded-md p-2.5 text-xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-semibold">{s.currency} {Number(s.amount).toLocaleString()}</span>
                      <span className="text-muted-foreground">{new Date(s.effectiveDate).toLocaleDateString()}</span>
                    </div>
                    {s.note && <p className="text-muted-foreground">{s.note}</p>}
                  </div>
                ))}
                {salaries.length === 0 && <p className="text-xs text-muted-foreground text-center pt-4">No salary records. HR manager can add via API.</p>}
              </>
            )}
          </div>
        </div>
      )}

      {/* Leave request modal */}
      {showLeave && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Request leave</h2>
              <button onClick={() => setShowLeave(false)}><X size={16} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <select value={leaveForm.type} onChange={e => setLeaveForm(f => ({ ...f, type: e.target.value }))}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none"
              >
                {['ANNUAL', 'SICK', 'UNPAID', 'MATERNITY', 'PATERNITY', 'OTHER'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Start *</label>
                  <input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full border rounded-md px-2 py-2 text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">End *</label>
                  <input type="date" value={leaveForm.endDate} onChange={e => setLeaveForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full border rounded-md px-2 py-2 text-sm focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Days *</label>
                <input type="number" step="0.5" value={leaveForm.days} onChange={e => setLeaveForm(f => ({ ...f, days: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Reason</label>
                <textarea value={leaveForm.reason} onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))}
                  rows={2} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowLeave(false)} className="border rounded-md px-3 py-2 text-sm hover:bg-muted">Cancel</button>
              <button onClick={() => requestLeaveMut.mutate()} disabled={!leaveForm.startDate || !leaveForm.endDate || requestLeaveMut.isPending}
                className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
              >{requestLeaveMut.isPending ? '…' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
