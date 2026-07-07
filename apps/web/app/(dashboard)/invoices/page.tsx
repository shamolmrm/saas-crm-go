'use client'

import { useState }  from 'react'
import Link           from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api }        from '@/lib/api'
import { Plus, FileText, TrendingUp, X, Trash2 } from 'lucide-react'

type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'VOID'

interface InvoiceItem { description: string; quantity: number; unitPrice: number }
interface Invoice {
  id: string; number?: string; status: InvoiceStatus; currency: string
  createdAt: string; dueDate?: string; paidAt?: string
  contact: { id: string; name: string } | null
  items: InvoiceItem[]
  _count: { payments: number }
}

interface Contact { id: string; name: string }

const invoicesApi = {
  list:    (status?: string) => api.get<{ invoices: Invoice[]; total: number }>('/invoices', { params: status ? { status } : {} }),
  create:  (d: object) => api.post<Invoice>('/invoices', d),
  pl:      () => api.get<{ revenue: number; totalExpenses: number; profit: number; invoicesPaid: number; expByCategory: Record<string, number> }>('/invoices/reports/pl'),
  contacts: () => api.get<{ contacts: Contact[] }>('/contacts'),
}

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  DRAFT:   'bg-gray-100 text-gray-600',
  SENT:    'bg-blue-100 text-blue-700',
  PAID:    'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-600',
  VOID:    'bg-muted text-muted-foreground line-through',
}

function calcTotal(items: InvoiceItem[]) {
  return items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
}

const STATUS_TABS = ['ALL', 'DRAFT', 'SENT', 'PAID', 'OVERDUE'] as const

export default function InvoicesPage() {
  const qc = useQueryClient()
  const [tab, setTab]       = useState<typeof STATUS_TABS[number]>('ALL')
  const [showNew, setShowNew] = useState(false)
  const [showPL, setShowPL]   = useState(false)
  const [form, setForm]       = useState({
    contactId: '', currency: 'USD', notes: '', dueDate: '',
    items: [{ description: '', quantity: 1, unitPrice: 0 }] as InvoiceItem[],
  })

  const { data } = useQuery({
    queryKey: ['invoices', tab],
    queryFn:  () => invoicesApi.list(tab === 'ALL' ? undefined : tab).then(r => r.data),
  })

  const { data: pl } = useQuery({
    queryKey: ['pl-report'],
    queryFn:  () => invoicesApi.pl().then(r => r.data),
    enabled:  showPL,
  })

  const { data: contactsData } = useQuery({
    queryKey: ['contacts-for-invoices'],
    queryFn:  () => invoicesApi.contacts().then(r => r.data),
  })
  const contacts = contactsData?.contacts ?? []

  const createMut = useMutation({
    mutationFn: () => invoicesApi.create({
      ...form,
      contactId: form.contactId || undefined,
      dueDate:   form.dueDate   || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); setShowNew(false) },
  })

  const invoices = data?.invoices ?? []

  const updateItem = (i: number, field: keyof InvoiceItem, val: string | number) => {
    setForm(f => {
      const items = [...f.items]
      items[i] = { ...items[i], [field]: val }
      return { ...f, items }
    })
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><FileText size={20} /> Invoices</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Create, send, and track invoices</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowPL(p => !p)}
            className="flex items-center gap-1.5 border rounded-md px-3 py-2 text-sm hover:bg-muted"
          ><TrendingUp size={14} /> P&L</button>
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium"
          ><Plus size={14} /> New invoice</button>
        </div>
      </div>

      {/* P&L banner */}
      {showPL && pl && (
        <div className="border rounded-xl p-5 mb-6 bg-muted/20 grid grid-cols-4 gap-4">
          {[
            { label: 'Revenue', value: pl.revenue, color: 'text-green-700' },
            { label: 'Expenses', value: pl.totalExpenses, color: 'text-red-600' },
            { label: 'Profit', value: pl.profit, color: pl.profit >= 0 ? 'text-green-700' : 'text-red-600' },
            { label: 'Paid invoices', value: pl.invoicesPaid, isCount: true, color: 'text-foreground' },
          ].map(m => (
            <div key={m.label} className="text-center">
              <p className="text-xs text-muted-foreground mb-1">{m.label}</p>
              <p className={`text-xl font-semibold ${m.color}`}>
                {m.isCount ? m.value : `$${Number(m.value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b mb-4">
        {STATUS_TABS.map(s => (
          <button key={s} onClick={() => setTab(s)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === s ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >{s.toLowerCase()}</button>
        ))}
      </div>

      {/* Invoice list */}
      {invoices.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <FileText size={32} className="text-muted-foreground mx-auto mb-3" />
          <h2 className="font-medium mb-1">No invoices yet</h2>
          <p className="text-muted-foreground text-sm">Create your first invoice to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => {
            const total = calcTotal(inv.items)
            return (
              <Link key={inv.id} href={`/invoices/${inv.id}`}
                className="block border rounded-lg px-5 py-4 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-muted-foreground">{inv.number ?? 'DRAFT'}</span>
                      <span className="font-medium text-sm truncate">{inv.contact?.name ?? 'No contact'}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[inv.status]}`}>{inv.status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {inv.items.length} item{inv.items.length !== 1 ? 's' : ''} ·{' '}
                      {inv.dueDate && `Due ${new Date(inv.dueDate).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-sm">{inv.currency} {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* New invoice modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">New invoice</h2>
              <button onClick={() => setShowNew(false)}><X size={16} className="text-muted-foreground" /></button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground block mb-1">Bill to</label>
                  <select value={form.contactId} onChange={e => setForm(f => ({ ...f, contactId: e.target.value }))}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">— select contact —</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Currency</label>
                  <input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Due date</label>
                <input type="date" value={form.dueDate.slice(0, 10)}
                  onChange={e => setForm(f => ({ ...f, dueDate: e.target.value ? new Date(e.target.value).toISOString() : '' }))}
                  className="border rounded-md px-3 py-2 text-sm focus:outline-none"
                />
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted-foreground">Line items</label>
                  <button onClick={() => setForm(f => ({ ...f, items: [...f.items, { description: '', quantity: 1, unitPrice: 0 }] }))}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  ><Plus size={11} /> Add item</button>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Description</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground w-20">Qty</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground w-24">Price</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground w-24">Total</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {form.items.map((item, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5">
                            <input value={item.description}
                              onChange={e => updateItem(i, 'description', e.target.value)}
                              placeholder="Item description"
                              className="w-full text-sm focus:outline-none bg-transparent"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <input type="number" min="0.001" step="any" value={item.quantity}
                              onChange={e => updateItem(i, 'quantity', Number(e.target.value))}
                              className="w-16 text-right text-sm focus:outline-none bg-transparent"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <input type="number" min="0" step="0.01" value={item.unitPrice}
                              onChange={e => updateItem(i, 'unitPrice', Number(e.target.value))}
                              className="w-20 text-right text-sm focus:outline-none bg-transparent"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right text-sm font-medium">
                            {(item.quantity * item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-1">
                            {form.items.length > 1 && (
                              <button onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                                className="text-muted-foreground hover:text-destructive p-1"
                              ><Trash2 size={12} /></button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-muted/20">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-sm font-medium text-right">Total</td>
                        <td className="px-3 py-2 text-sm font-bold text-right">
                          {form.currency} {calcTotal(form.items).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowNew(false)} className="border rounded-md px-3 py-2 text-sm hover:bg-muted">Cancel</button>
              <button
                onClick={() => createMut.mutate()}
                disabled={form.items.some(i => !i.description) || createMut.isPending}
                className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
              >{createMut.isPending ? 'Saving…' : 'Create draft'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
