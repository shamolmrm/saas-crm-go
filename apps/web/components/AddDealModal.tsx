'use client'

import { useState }       from 'react'
import { useForm }        from 'react-hook-form'
import { zodResolver }    from '@hookform/resolvers/zod'
import { z }              from 'zod'
import { X }              from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dealsApi, pipelineApi, contactsApi }    from '@/lib/api'

const schema = z.object({
  title:      z.string().min(1, 'Title is required').max(200),
  value:      z.coerce.number().min(0).optional(),
  currency:   z.string().default('USD'),
  pipelineId: z.string().min(1, 'Select a pipeline'),
  stageId:    z.string().min(1, 'Select a stage'),
  contactId:  z.string().optional(),
  ownerId:    z.string().optional(),
})
type FormValues = z.infer<typeof schema>

interface Props {
  defaultPipelineId?: string
  onClose: () => void
}

export function AddDealModal({ defaultPipelineId, onClose }: Props) {
  const queryClient = useQueryClient()
  const [selectedPipelineId, setSelectedPipelineId] = useState(defaultPipelineId ?? '')

  const { data: pipelines = [] } = useQuery({
    queryKey: ['pipelines'],
    queryFn:  () => pipelineApi.list().then(r => r.data),
  })

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts-minimal'],
    queryFn:  () => contactsApi.list({ limit: '200' }).then(r => r.data.contacts),
  })

  const stages = pipelines.find(p => p.id === selectedPipelineId)?.stages ?? []

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currency: 'USD', pipelineId: defaultPipelineId ?? '' },
  })

  const createMutation = useMutation({
    mutationFn: (data: FormValues) => dealsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board'] })
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      onClose()
    },
  })

  const onSubmit = (data: FormValues) => createMutation.mutate(data)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Add Deal</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Deal title *</label>
            <input {...register('title')}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. Acme Corp — Enterprise plan"
            />
            {errors.title && <p className="text-destructive text-xs mt-1">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Value</label>
              <input {...register('value')} type="number" min="0" step="0.01"
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Currency</label>
              <select {...register('currency')}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {['USD', 'EUR', 'GBP', 'BDT', 'INR', 'AED'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Pipeline *</label>
            <select {...register('pipelineId')}
              onChange={e => {
                setValue('pipelineId', e.target.value)
                setValue('stageId', '')
                setSelectedPipelineId(e.target.value)
              }}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select pipeline</option>
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {errors.pipelineId && <p className="text-destructive text-xs mt-1">{errors.pipelineId.message}</p>}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Stage *</label>
            <select {...register('stageId')}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={!selectedPipelineId}
            >
              <option value="">Select stage</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {errors.stageId && <p className="text-destructive text-xs mt-1">{errors.stageId.message}</p>}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Contact</label>
            <select {...register('contactId')}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">No contact</option>
              {contacts.map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>
              ))}
            </select>
          </div>

          {createMutation.error && (
            <p className="text-destructive text-sm">Failed to create deal. Try again.</p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting || createMutation.isPending}
              className="flex-1 bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Create deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
