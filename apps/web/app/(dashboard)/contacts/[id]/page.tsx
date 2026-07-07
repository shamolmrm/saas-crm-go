'use client'

import { useState }               from 'react'
import { useParams, useRouter }   from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm }                from 'react-hook-form'
import { zodResolver }            from '@hookform/resolvers/zod'
import { z }                      from 'zod'
import { contactsApi }            from '@/lib/api'
import { Sparkles, Mail, Phone, Building2, Briefcase, ArrowLeft, Pencil, Plus } from 'lucide-react'
import Link                       from 'next/link'

const editSchema = z.object({
  name:     z.string().min(1).max(200),
  email:    z.string().email().optional().or(z.literal('')),
  phone:    z.string().max(50).optional(),
  company:  z.string().max(200).optional(),
  jobTitle: z.string().max(200).optional(),
  notes:    z.string().max(10000).optional(),
})
type EditValues = z.infer<typeof editSchema>

const activitySchema = z.object({
  type:    z.enum(['NOTE', 'EMAIL', 'CALL', 'MEETING', 'TASK']),
  subject: z.string().max(500).optional(),
  body:    z.string().max(10000).optional(),
})
type ActivityValues = z.infer<typeof activitySchema>

export default function ContactDetailPage() {
  const { id }         = useParams<{ id: string }>()
  const router         = useRouter()
  const queryClient    = useQueryClient()
  const [editing, setEditing]       = useState(false)
  const [addingNote, setAddingNote] = useState(false)
  const [summaryText, setSummaryText] = useState<string | null>(null)

  const { data: contact, isLoading } = useQuery({
    queryKey: ['contact', id],
    queryFn:  () => contactsApi.get(id).then(r => r.data),
  })

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    values: contact ? {
      name: contact.name, email: contact.email ?? '', phone: contact.phone ?? '',
      company: contact.company ?? '', jobTitle: contact.jobTitle ?? '', notes: contact.notes ?? '',
    } : undefined,
  })

  const activityForm = useForm<ActivityValues>({
    resolver: zodResolver(activitySchema),
    defaultValues: { type: 'NOTE' },
  })

  const updateMutation = useMutation({
    mutationFn: (data: EditValues) => contactsApi.update(id, data),
    onSuccess:  () => { queryClient.invalidateQueries({ queryKey: ['contact', id] }); setEditing(false) },
  })

  const deleteMutation = useMutation({
    mutationFn: () => contactsApi.delete(id),
    onSuccess:  () => router.push('/contacts'),
  })

  const activityMutation = useMutation({
    mutationFn: (data: ActivityValues) =>
      contactsApi.logActivity(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact', id] })
      activityForm.reset({ type: 'NOTE' })
      setAddingNote(false)
    },
  })

  const aiSummaryMutation = useMutation({
    mutationFn: () => contactsApi.aiSummary(id).then(r => r.data.summary),
    onSuccess:  (summary) => {
      setSummaryText(summary)
      queryClient.invalidateQueries({ queryKey: ['contact', id] })
    },
  })

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Loading…</div>
  if (!contact)  return <div className="p-6 text-destructive text-sm">Contact not found</div>

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/contacts" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">{contact.name}</h1>
            {contact.jobTitle && contact.company && (
              <p className="text-muted-foreground text-sm mt-0.5">
                {contact.jobTitle} at {contact.company}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => aiSummaryMutation.mutate()}
            disabled={aiSummaryMutation.isPending}
            className="flex items-center gap-1.5 border rounded-md px-3 py-1.5 text-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Sparkles size={14} className="text-primary" />
            {aiSummaryMutation.isPending ? 'Generating…' : 'AI Summary'}
          </button>
          <button
            onClick={() => setEditing(!editing)}
            className="flex items-center gap-1.5 border rounded-md px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <Pencil size={13} /> Edit
          </button>
        </div>
      </div>

      {/* AI Summary */}
      {(summaryText ?? contact.aiSummary) && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6 text-sm">
          <div className="flex items-center gap-1.5 text-primary font-medium mb-1.5">
            <Sparkles size={13} /> AI Summary
          </div>
          <p className="text-foreground leading-relaxed">{summaryText ?? contact.aiSummary}</p>
          {contact.aiSummaryAt && (
            <p className="text-muted-foreground text-xs mt-2">
              Updated {new Date(contact.aiSummaryAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
      {aiSummaryMutation.isError && (
        <div className="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2 mb-4">
          AI summary unavailable. (Add OpenAI key to .env to enable)
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <form onSubmit={editForm.handleSubmit(d => updateMutation.mutate(d))}
          className="border rounded-lg p-4 mb-6 space-y-3"
        >
          <h2 className="font-medium text-sm mb-2">Edit Contact</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: 'name' as const,     label: 'Name *',     placeholder: 'Jane Smith' },
              { name: 'email' as const,    label: 'Email',      placeholder: 'jane@example.com' },
              { name: 'phone' as const,    label: 'Phone',      placeholder: '+1 555 000 0000' },
              { name: 'company' as const,  label: 'Company',    placeholder: 'Acme Corp' },
              { name: 'jobTitle' as const, label: 'Job title',  placeholder: 'CEO' },
            ].map(f => (
              <div key={f.name} className={f.name === 'name' ? 'col-span-2' : ''}>
                <label className="text-xs font-medium mb-1 block text-muted-foreground">{f.label}</label>
                <input {...editForm.register(f.name)}
                  placeholder={f.placeholder}
                  className="w-full border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            ))}
            <div className="col-span-2">
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Notes</label>
              <textarea {...editForm.register('notes')} rows={3}
                className="w-full border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setEditing(false)}
              className="flex-1 border rounded px-3 py-1.5 text-sm hover:bg-muted"
            >Cancel</button>
            <button type="submit" disabled={updateMutation.isPending}
              className="flex-1 bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >{updateMutation.isPending ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      )}

      {/* Contact info */}
      <div className="border rounded-lg divide-y mb-6">
        {[
          { icon: Mail,      label: 'Email',   value: contact.email },
          { icon: Phone,     label: 'Phone',   value: contact.phone },
          { icon: Building2, label: 'Company', value: contact.company },
          { icon: Briefcase, label: 'Title',   value: contact.jobTitle },
        ].map(({ icon: Icon, label, value }) => value && (
          <div key={label} className="flex items-center gap-3 px-4 py-3">
            <Icon size={14} className="text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground w-16">{label}</span>
            <span className="text-sm">{value}</span>
          </div>
        ))}
      </div>

      {/* Deals */}
      {contact.deals?.length > 0 && (
        <div className="mb-6">
          <h2 className="font-medium text-sm mb-3">Deals ({contact.deals.length})</h2>
          <div className="space-y-2">
            {contact.deals.map((deal: { id: string; title: string; stage?: { name: string }; value?: number; currency: string; status: string }) => (
              <div key={deal.id} className="border rounded-md px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{deal.title}</p>
                  <p className="text-xs text-muted-foreground">{deal.stage?.name}</p>
                </div>
                <div className="text-right">
                  {deal.value != null && (
                    <p className="text-sm font-medium">{deal.currency} {deal.value.toLocaleString()}</p>
                  )}
                  <span className={`text-xs ${deal.status === 'WON' ? 'text-green-600' : deal.status === 'LOST' ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {deal.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity log */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-sm">Activity</h2>
          <button
            onClick={() => setAddingNote(!addingNote)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus size={12} /> Log activity
          </button>
        </div>

        {addingNote && (
          <form onSubmit={activityForm.handleSubmit(d => activityMutation.mutate(d))}
            className="border rounded-lg p-4 mb-3 space-y-3"
          >
            <div className="flex gap-2">
              {(['NOTE', 'CALL', 'EMAIL', 'MEETING', 'TASK'] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => activityForm.setValue('type', t)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${activityForm.watch('type') === t ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                >{t}</button>
              ))}
            </div>
            <input {...activityForm.register('subject')}
              placeholder="Subject (optional)"
              className="w-full border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <textarea {...activityForm.register('body')} rows={3}
              placeholder="Add details…"
              className="w-full border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setAddingNote(false)}
                className="flex-1 border rounded px-3 py-1.5 text-sm hover:bg-muted"
              >Cancel</button>
              <button type="submit" disabled={activityMutation.isPending}
                className="flex-1 bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >{activityMutation.isPending ? 'Logging…' : 'Log'}</button>
            </div>
          </form>
        )}

        {(contact as { activities?: { id: string; type: string; subject?: string | null; body?: string | null; occurredAt: string }[] }).activities?.length === 0 && !addingNote && (
          <p className="text-muted-foreground text-sm text-center py-6 border rounded-lg">No activity yet</p>
        )}
        <div className="space-y-2">
          {(contact as { activities?: { id: string; type: string; subject?: string | null; body?: string | null; occurredAt: string }[] }).activities?.map(a => (
            <div key={a.id} className="border rounded-md px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded">{a.type}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(a.occurredAt).toLocaleDateString()}
                </span>
              </div>
              {a.subject && <p className="text-sm font-medium">{a.subject}</p>}
              {a.body && <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{a.body}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      {contact.notes && !editing && (
        <div className="border rounded-lg p-4 mb-6">
          <h2 className="font-medium text-sm mb-2">Notes</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{contact.notes}</p>
        </div>
      )}

      {/* Danger zone */}
      <div className="border border-destructive/30 rounded-lg p-4">
        <h2 className="font-medium text-sm text-destructive mb-1">Danger zone</h2>
        <p className="text-xs text-muted-foreground mb-3">Permanently delete this contact and all associated data.</p>
        <button
          onClick={() => { if (confirm('Delete this contact? This cannot be undone.')) deleteMutation.mutate() }}
          disabled={deleteMutation.isPending}
          className="text-destructive border border-destructive/40 rounded-md px-3 py-1.5 text-sm hover:bg-destructive/10 disabled:opacity-50"
        >
          {deleteMutation.isPending ? 'Deleting…' : 'Delete contact'}
        </button>
      </div>
    </div>
  )
}
