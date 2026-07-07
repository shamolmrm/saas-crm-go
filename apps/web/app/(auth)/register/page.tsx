'use client'

import { useState }    from 'react'
import { useRouter }   from 'next/navigation'
import { useForm }     from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z }           from 'zod'
import { api, setTokens } from '@/lib/api'

const RegisterSchema = z.object({
  name:           z.string().min(1, 'Name is required').max(100),
  email:          z.string().email('Enter a valid email'),
  password:       z.string().min(8, 'Password must be at least 8 characters'),
  tenantName:     z.string().min(1, 'Workspace name is required').max(100),
})
type RegisterForm = z.infer<typeof RegisterSchema>

export default function RegisterPage() {
  const router  = useRouter()
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterForm>({
    resolver: zodResolver(RegisterSchema),
  })

  const onSubmit = async (data: RegisterForm) => {
    setError(null)
    try {
      const res = await api.post('/auth/register', data)
      setTokens(res.data.accessToken, res.data.refreshToken)
      router.push('/deals')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Registration failed. Please try again.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-card border rounded-lg p-8 shadow-sm">
          <h1 className="text-2xl font-semibold mb-1">Create your account</h1>
          <p className="text-muted-foreground text-sm mb-6">Start your free trial — no credit card required</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {([
              { name: 'name',       label: 'Full name',       type: 'text',     autocomplete: 'name' },
              { name: 'email',      label: 'Email',           type: 'email',    autocomplete: 'email' },
              { name: 'password',   label: 'Password',        type: 'password', autocomplete: 'new-password' },
              { name: 'tenantName', label: 'Workspace name',  type: 'text',     autocomplete: 'organization' },
            ] as const).map(({ name, label, type, autocomplete }) => (
              <div key={name}>
                <label className="text-sm font-medium block mb-1">{label}</label>
                <input
                  type={type}
                  autoComplete={autocomplete}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  {...register(name)}
                />
                {errors[name] && <p className="text-destructive text-xs mt-1">{errors[name]?.message}</p>}
              </div>
            ))}

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition"
            >
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{' '}
            <a href="/login" className="text-primary hover:underline">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  )
}
