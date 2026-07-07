'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams }    from 'next/navigation'
import { useForm }                       from 'react-hook-form'
import { zodResolver }                   from '@hookform/resolvers/zod'
import { z }                             from 'zod'
import axios                             from 'axios'
import { setTokens }                     from '@/lib/api'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

interface InviteInfo {
  email: string
  role:  string
  tenantName: string
  expiresAt:  string
}

function InvitePage() {
  const router       = useRouter()
  const params       = useSearchParams()
  const token        = params.get('token') ?? ''
  const [info, setInfo]   = useState<InviteInfo | null>(null)
  const [error, setError] = useState('')
  const [isNew, setIsNew] = useState(false)

  useEffect(() => {
    if (!token) { setError('Missing invite token'); return }
    axios.get(`${API}/invite?token=${token}`)
      .then(r => {
        setInfo(r.data)
        // Check if user already has an account
        setIsNew(true) // default to new — we'll show name+password fields
      })
      .catch(() => setError('This invitation is invalid or has expired.'))
  }, [token])

  const schema = z.object({
    name:     z.string().min(1, 'Required').max(100).optional(),
    password: z.string().min(8, 'Min 8 characters').max(128).optional(),
  })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: { name?: string; password?: string }) => {
    try {
      const res = await axios.post(`${API}/invite/accept`, {
        token,
        ...data,
      })
      setTokens(res.data.accessToken, res.data.refreshToken)
      router.push('/')
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error ?? 'Failed to accept invite')
      } else {
        setError('Failed to accept invite')
      }
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="bg-background rounded-xl shadow-lg p-8 w-full max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">Invitation error</h1>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="bg-background rounded-xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold">You&apos;re invited!</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Join <strong>{info.tenantName}</strong> as <span className="capitalize">{info.role.toLowerCase()}</span>
          </p>
          <p className="text-sm mt-1 text-primary">{info.email}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {isNew && (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">Your name</label>
                <input {...register('name')} autoFocus
                  placeholder="Jane Smith"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {errors.name?.message && <p className="text-destructive text-xs mt-1">{String(errors.name.message)}</p>}
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Create password</label>
                <input {...register('password')} type="password"
                  placeholder="At least 8 characters"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {errors.password?.message && <p className="text-destructive text-xs mt-1">{String(errors.password.message)}</p>}
              </div>
            </>
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}

          <button type="submit" disabled={isSubmitting}
            className="w-full bg-primary text-primary-foreground rounded-md py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {isSubmitting ? 'Joining…' : `Accept & join ${info.tenantName}`}
          </button>
          <p className="text-xs text-center text-muted-foreground">
            Already have an account? <button type="button" onClick={() => setIsNew(false)} className="text-primary hover:underline">Sign in instead</button>
          </p>
        </form>
      </div>
    </div>
  )
}

export default function InvitePageWrapper() {
  return <Suspense><InvitePage /></Suspense>
}
