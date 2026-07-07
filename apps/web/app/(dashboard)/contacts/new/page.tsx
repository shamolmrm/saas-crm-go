'use client'

import { useRouter }   from 'next/navigation'
import { useForm }     from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z }           from 'zod'
import { useMutation } from '@tanstack/react-query'
import { contactsApi } from '@/lib/api'
import { ArrowLeft }   from 'lucide-react'
import Link            from 'next/link'

const schema = z.object({
  name:     z.string().min(1, 'Name is required').max(200),
  email:    z.string().email('Invalid email').optional().or(z.literal('')),
  phone:    z.string().max(50).optional(),
  company:  z.string().max(200).optional(),
  jobTitle: z.string().max(200).optional(),
  notes:    z.string().max(10000).optional(),
})
type FormValues = z.infer<typeof schema>

export default function NewContactPage() {
  const router = useRouter()

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const createMutation = useMutation({
    mutationFn: (data: FormValues) => contactsApi.create(data),
    onSuccess:  (res) => router.push(`/contacts/${res.data.id}`),
  })

  const onSubmit = (data: FormValues) => createMutation.mutate(data)

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/contacts" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-2xl font-semibold">New Contact</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-sm font-medium mb-1 block">Full name *</label>
            <input {...register('name')}
              autoFocus
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Jane Smith"
            />
            {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Email</label>
            <input {...register('email')} type="email"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="jane@example.com"
            />
            {errors.email && <p className="text-destructive text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Phone</label>
            <input {...register('phone')}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="+1 555 000 0000"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Company</label>
            <input {...register('company')}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Acme Corp"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Job title</label>
            <input {...register('jobTitle')}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="CEO"
            />
          </div>

          <div className="col-span-2">
            <label className="text-sm font-medium mb-1 block">Notes</label>
            <textarea {...register('notes')} rows={4}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Any additional notes about this contact…"
            />
          </div>
        </div>

        {createMutation.error && (
          <p className="text-destructive text-sm">Failed to create contact. Please try again.</p>
        )}

        <div className="flex gap-2 pt-1">
          <Link href="/contacts"
            className="flex-1 text-center border rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </Link>
          <button type="submit" disabled={isSubmitting || createMutation.isPending}
            className="flex-1 bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {createMutation.isPending ? 'Saving…' : 'Save contact'}
          </button>
        </div>
      </form>
    </div>
  )
}
