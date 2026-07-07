'use client'

import { useState }  from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api }       from '@/lib/api'
import { Plus, Package, AlertTriangle, TrendingDown, ArrowUp, ArrowDown, X } from 'lucide-react'

interface Product {
  id: string; name: string; sku?: string; unit: string
  currentStock: number; allowBackorder: boolean
  unitCost?: number; unitPrice?: number
}

interface Movement {
  id: string; type: string; quantity: number; balance: number; note?: string; createdAt: string
}

const inventoryApi = {
  products:   () => api.get<Product[]>('/inventory/products'),
  movements:  (id: string) => api.get<Movement[]>(`/inventory/products/${id}/movements`),
  create:     (d: object) => api.post<Product>('/inventory/products', d),
  adjust:     (id: string, d: object) => api.post(`/inventory/products/${id}/adjust`, d),
  lowStock:   () => api.get<Product[]>('/inventory/low-stock'),
}

const TYPE_COLOR: Record<string, string> = {
  RECEIVED: 'text-green-600',
  SOLD:     'text-blue-600',
  ADJUSTED: 'text-amber-600',
  RETURNED: 'text-purple-600',
  WRITE_OFF:'text-red-600',
}

export default function InventoryPage() {
  const qc = useQueryClient()
  const [selected, setSelected]   = useState<Product | null>(null)
  const [showNew, setShowNew]     = useState(false)
  const [showAdj, setShowAdj]     = useState(false)
  const [newForm, setNewForm]     = useState({ name: '', sku: '', unit: 'pcs', unitCost: '', unitPrice: '', allowBackorder: false })
  const [adjForm, setAdjForm]     = useState({ type: 'RECEIVED' as string, quantity: '1', note: '' })

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn:  () => inventoryApi.products().then(r => r.data),
  })

  const { data: movements = [] } = useQuery({
    queryKey: ['movements', selected?.id],
    queryFn:  () => selected ? inventoryApi.movements(selected.id).then(r => r.data) : [],
    enabled:  !!selected,
  })

  const { data: lowStock = [] } = useQuery({
    queryKey: ['low-stock'],
    queryFn:  () => inventoryApi.lowStock().then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: () => inventoryApi.create({
      name:          newForm.name,
      sku:           newForm.sku    || undefined,
      unit:          newForm.unit,
      unitCost:      newForm.unitCost  ? Number(newForm.unitCost)  : undefined,
      unitPrice:     newForm.unitPrice ? Number(newForm.unitPrice) : undefined,
      allowBackorder: newForm.allowBackorder,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); setShowNew(false) },
  })

  const adjustMut = useMutation({
    mutationFn: () => selected ? inventoryApi.adjust(selected.id, {
      type:     adjForm.type,
      quantity: Number(adjForm.quantity),
      note:     adjForm.note || undefined,
    }) : Promise.reject(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['movements', selected?.id] })
      qc.invalidateQueries({ queryKey: ['low-stock'] })
      setShowAdj(false)
    },
  })

  return (
    <div className="flex h-full">
      {/* Product list */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b px-6 py-4 flex items-center gap-4 shrink-0">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><Package size={18} /> Inventory</h1>
            {lowStock.length > 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                <AlertTriangle size={11} /> {lowStock.length} product{lowStock.length !== 1 ? 's' : ''} low on stock
              </p>
            )}
          </div>
          <button onClick={() => setShowNew(true)}
            className="ml-auto flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium"
          ><Plus size={14} /> Add product</button>
        </div>

        <div className="flex-1 overflow-auto">
          {products.length === 0 ? (
            <div className="p-12 text-center">
              <Package size={32} className="text-muted-foreground mx-auto mb-3" />
              <h2 className="font-medium mb-1">No products yet</h2>
              <p className="text-muted-foreground text-sm">Add your first product to track inventory.</p>
            </div>
          ) : (
            <div className="divide-y">
              {products.map(p => (
                <button key={p.id} onClick={() => { setSelected(p); setShowAdj(false) }}
                  className={`w-full text-left px-5 py-3 hover:bg-muted/30 transition-colors flex items-center gap-4 ${selected?.id === p.id ? 'bg-primary/5' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{p.name}</p>
                    {p.sku && <p className="text-xs text-muted-foreground">SKU: {p.sku}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-semibold text-sm ${p.currentStock <= 5 ? 'text-red-600' : 'text-foreground'}`}>
                      {p.currentStock} {p.unit}
                    </p>
                    {p.unitPrice && <p className="text-xs text-muted-foreground">${Number(p.unitPrice).toFixed(2)}/{p.unit}</p>}
                  </div>
                  {p.currentStock <= 5 && <AlertTriangle size={14} className="text-amber-500 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel — movements + adjust */}
      {selected && (
        <div className="w-72 border-l flex flex-col shrink-0">
          <div className="border-b px-4 py-3 flex items-center justify-between shrink-0">
            <div>
              <p className="font-semibold text-sm">{selected.name}</p>
              <p className="text-xs text-muted-foreground">{selected.currentStock} {selected.unit} in stock</p>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => setShowAdj(true)}
                className="border rounded-md px-2.5 py-1 text-xs hover:bg-muted"
              >Adjust</button>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Movement history</p>
            {movements.length === 0 ? (
              <p className="text-xs text-muted-foreground">No movements yet.</p>
            ) : (
              movements.map(m => (
                <div key={m.id} className="flex items-center gap-2 text-xs">
                  {m.quantity > 0
                    ? <ArrowUp size={11} className="text-green-600 shrink-0" />
                    : <ArrowDown size={11} className="text-red-500 shrink-0" />}
                  <span className={`font-medium ${TYPE_COLOR[m.type]}`}>{m.type}</span>
                  <span className={m.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                    {m.quantity > 0 ? '+' : ''}{m.quantity}
                  </span>
                  <span className="text-muted-foreground ml-auto">{m.balance}</span>
                </div>
              ))
            )}
          </div>

          {/* Adjust panel */}
          {showAdj && (
            <div className="border-t p-4 bg-muted/20 shrink-0">
              <p className="text-xs font-semibold mb-3">Stock adjustment</p>
              <div className="space-y-2">
                <select value={adjForm.type} onChange={e => setAdjForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full border rounded-md px-2 py-1.5 text-xs focus:outline-none bg-background"
                >
                  {['RECEIVED', 'ADJUSTED', 'RETURNED', 'WRITE_OFF'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="number" value={adjForm.quantity} onChange={e => setAdjForm(f => ({ ...f, quantity: e.target.value }))}
                  placeholder={adjForm.type === 'WRITE_OFF' ? '-5 (negative)' : 'Quantity (positive)'}
                  className="w-full border rounded-md px-2 py-1.5 text-xs focus:outline-none"
                />
                <input value={adjForm.note} onChange={e => setAdjForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Note (optional)"
                  className="w-full border rounded-md px-2 py-1.5 text-xs focus:outline-none"
                />
                <div className="flex gap-2">
                  <button onClick={() => setShowAdj(false)} className="flex-1 border rounded-md py-1.5 text-xs hover:bg-muted">Cancel</button>
                  <button onClick={() => adjustMut.mutate()} disabled={!adjForm.quantity || adjustMut.isPending}
                    className="flex-1 bg-primary text-primary-foreground rounded-md py-1.5 text-xs font-medium disabled:opacity-50"
                  >{adjustMut.isPending ? '…' : 'Save'}</button>
                </div>
                {adjustMut.isError && (
                  <p className="text-destructive text-xs">
                    {((adjustMut.error as { response?: { data?: { error?: string } } })?.response?.data?.error) ?? 'Failed'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* New product modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Add product</h2>
              <button onClick={() => setShowNew(false)}><X size={16} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Name *</label>
                <input value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">SKU</label>
                  <input value={newForm.sku} onChange={e => setNewForm(f => ({ ...f, sku: e.target.value }))}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Unit</label>
                  <input value={newForm.unit} onChange={e => setNewForm(f => ({ ...f, unit: e.target.value }))}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Cost price</label>
                  <input type="number" value={newForm.unitCost} onChange={e => setNewForm(f => ({ ...f, unitCost: e.target.value }))}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Sell price</label>
                  <input type="number" value={newForm.unitPrice} onChange={e => setNewForm(f => ({ ...f, unitPrice: e.target.value }))}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={newForm.allowBackorder} onChange={e => setNewForm(f => ({ ...f, allowBackorder: e.target.checked }))} />
                Allow backorders
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowNew(false)} className="border rounded-md px-3 py-2 text-sm hover:bg-muted">Cancel</button>
              <button onClick={() => createMut.mutate()} disabled={!newForm.name || createMut.isPending}
                className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
              >{createMut.isPending ? '…' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
