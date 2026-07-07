'use client'

import { useState }  from 'react'
import { useParams } from 'next/navigation'
import Link          from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api }       from '@/lib/api'
import { ArrowLeft, Send, Ban, CreditCard, Clock, FileText } from 'lucide-react'

type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'VOID'

interface InvoiceItem { id: string; description: string; quantity: number; unitPrice: number }
interface AuditEvent  { id: string; event: string; createdAt: string; metadata?: Record<string, unknown> }
interface Payment     { id: string; amount: number; currency: string; method: string; paidAt: string; notes?: string }

interface Invoice {
  id: string; number?: string; status: InvoiceStatus; currency: string
  taxRate?: number; notes?: string; dueDate?: string; paidAt?: string; voidReason?: string
  issuedAt?: string; createdAt: string
  contact:     { id: string; name: string; email?: string } | null
  deal:        { id: string; title: string } | null
  items:       InvoiceItem[]
  payments:    Payment[]
  auditEvents: AuditEvent[]
}

const invoiceApi = {
  get:      (id: string) => api.get<Invoice>(`/invoices/${id}`),
  send:     (id: string) => api.post(`/invoices/${id}/send`),
  void:     (id: string, reason: string) => api.post(`/invoices/${id}/void`, { reason }),
  payment:  (id: string, data: object) => api.post(`/invoices/${id}/payments`, data),
}

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  DRAFT:   'bg-gray-100 text-gray-600',
  SENT:    'bg-blue-100 text-blue-700',
  PAID:    'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-600',
  VOID:    'bg-muted text-muted-foreground',
}

export default function InvoiceDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const qc       = useQueryClient()
  const [showPayment, setShowPayment] = useState(false)
  const [showVoid, setShowVoid]       = useState(false)
  const [voidReason, setVoidReason]   = useState('')
  const [payForm, setPayForm]         = useState({ amount: '', method: 'BANK_TRANSFER', notes: '' })

  const { data: inv, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn:  () => invoiceApi.get(id).then(r => r.data),
  })

  const sendMut = useMutation({
    mutationFn: () => invoiceApi.send(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['invoice', id] }),
  })

  const voidMut = useMutation({
    mutationFn: () => invoiceApi.void(id, voidReason),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['invoice', id] }); setShowVoid(false) },
  })

  const payMut = useMutation({
    mutationFn: () => invoiceApi.payment(id, { amount: Number(payForm.amount), method: payForm.method, notes: payForm.notes || undefined }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['invoice', id] }); setShowPayment(false) },
  })

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>
  if (!inv) return <div className="p-8 text-muted-foreground">Invoice not found.</div>

  const subtotal = inv.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const tax      = subtotal * (inv.taxRate ?? 0)
  const total    = subtotal + tax
  const paid     = inv.payments.reduce((s, p) => s + Number(p.amount), 0)
  const balance  = total - paid

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/invoices" className="text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /></Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{inv.number ?? 'Draft Invoice'}</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[inv.status]}`}>{inv.status}</span>
          </div>
          {inv.contact && <p className="text-sm text-muted-foreground mt-0.5">{inv.contact.name}</p>}
        </div>
        <div className="flex gap-2">
          {inv.status === 'DRAFT' && (
            <button onClick={() => sendMut.mutate()} disabled={sendMut.isPending}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
            ><Send size={13} /> {sendMut.isPending ? 'Sending…' : 'Send invoice'}</button>
          )}
          {(inv.status === 'SENT' || inv.status === 'OVERDUE') && (
            <button onClick={() => setShowPayment(true)}
              className="flex items-center gap-1.5 bg-green-600 text-white rounded-md px-3 py-2 text-sm font-medium hover:bg-green-700"
            ><CreditCard size={13} /> Record payment</button>
          )}
          {inv.status !== 'VOID' && inv.status !== 'PAID' && (
            <button onClick={() => setShowVoid(true)}
              className="flex items-center gap-1.5 border rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:border-destructive"
            ><Ban size={13} /> Void</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Invoice body */}
        <div className="col-span-2 space-y-5">
          {/* Items table */}
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Description</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground w-16">Qty</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground w-24">Price</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground w-28">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inv.items.map(item => (
                  <tr key={item.id}>
                    <td className="px-4 py-2.5">{item.description}</td>
                    <td className="px-4 py-2.5 text-right">{item.quantity}</td>
                    <td className="px-4 py-2.5 text-right">{inv.currency} {Number(item.unitPrice).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{inv.currency} {(item.quantity * item.unitPrice).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/20">
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-sm text-right text-muted-foreground">Subtotal</td>
                  <td className="px-4 py-2 text-sm text-right">{inv.currency} {subtotal.toFixed(2)}</td>
                </tr>
                {inv.taxRate && (
                  <tr>
                    <td colSpan={3} className="px-4 py-1.5 text-sm text-right text-muted-foreground">Tax ({(inv.taxRate * 100).toFixed(0)}%)</td>
                    <td className="px-4 py-1.5 text-sm text-right">{inv.currency} {tax.toFixed(2)}</td>
                  </tr>
                )}
                <tr className="border-t">
                  <td colSpan={3} className="px-4 py-2.5 text-sm font-semibold text-right">Total</td>
                  <td className="px-4 py-2.5 font-bold text-right">{inv.currency} {total.toFixed(2)}</td>
                </tr>
                {paid > 0 && (
                  <>
                    <tr>
                      <td colSpan={3} className="px-4 py-1.5 text-sm text-right text-green-600">Paid</td>
                      <td className="px-4 py-1.5 text-sm text-right text-green-600">− {inv.currency} {paid.toFixed(2)}</td>
                    </tr>
                    <tr className="border-t">
                      <td colSpan={3} className="px-4 py-2.5 text-sm font-semibold text-right">Balance due</td>
                      <td className="px-4 py-2.5 font-bold text-right">{inv.currency} {balance.toFixed(2)}</td>
                    </tr>
                  </>
                )}
              </tfoot>
            </table>
          </div>

          {inv.notes && (
            <div className="border rounded-xl px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground text-xs mb-1">Notes</p>
              {inv.notes}
            </div>
          )}

          {/* Audit trail */}
          {inv.auditEvents.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Audit trail</p>
              <div className="space-y-1">
                {inv.auditEvents.map(e => (
                  <div key={e.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock size={10} className="shrink-0" />
                    <span className="font-medium">{e.event}</span>
                    <span>{new Date(e.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <div className="border rounded-xl p-4 space-y-3">
            {inv.contact && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Bill to</p>
                <Link href={`/contacts/${inv.contact.id}`} className="text-sm font-medium hover:text-primary">{inv.contact.name}</Link>
                {inv.contact.email && <p className="text-xs text-muted-foreground">{inv.contact.email}</p>}
              </div>
            )}
            {inv.dueDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Due date</p>
                <p className="text-sm">{new Date(inv.dueDate).toLocaleDateString()}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Created</p>
              <p className="text-sm">{new Date(inv.createdAt).toLocaleDateString()}</p>
            </div>
            {inv.voidReason && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Void reason</p>
                <p className="text-sm text-muted-foreground">{inv.voidReason}</p>
              </div>
            )}
          </div>

          {/* Payments */}
          {inv.payments.length > 0 && (
            <div className="border rounded-xl p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payments</p>
              {inv.payments.map(p => (
                <div key={p.id} className="flex items-center justify-between text-sm py-1">
                  <span className="text-muted-foreground">{p.method.replace('_', ' ')}</span>
                  <span className="font-medium text-green-700">+{p.currency} {Number(p.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Record payment modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="font-semibold mb-4">Record payment</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Amount ({inv.currency})</label>
                <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder={balance.toFixed(2)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Method</label>
                <select value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none"
                >
                  {['CASH', 'BANK_TRANSFER', 'CARD', 'MOBILE', 'CHEQUE', 'OTHER'].map(m => (
                    <option key={m} value={m}>{m.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Notes (optional)</label>
                <input value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowPayment(false)} className="border rounded-md px-3 py-2 text-sm hover:bg-muted">Cancel</button>
              <button onClick={() => payMut.mutate()} disabled={!payForm.amount || payMut.isPending}
                className="bg-green-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >{payMut.isPending ? '…' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Void modal */}
      {showVoid && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="font-semibold mb-2">Void invoice</h2>
            <p className="text-sm text-muted-foreground mb-4">This action cannot be undone. Please provide a reason.</p>
            <textarea value={voidReason} onChange={e => setVoidReason(e.target.value)}
              placeholder="e.g. Duplicate invoice, customer cancelled order"
              rows={3} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none resize-none mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowVoid(false)} className="border rounded-md px-3 py-2 text-sm hover:bg-muted">Cancel</button>
              <button onClick={() => voidMut.mutate()} disabled={!voidReason.trim() || voidMut.isPending}
                className="bg-destructive text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
              >{voidMut.isPending ? '…' : 'Void invoice'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
