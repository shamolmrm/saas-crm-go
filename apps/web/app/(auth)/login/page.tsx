'use client'

import { useState }     from 'react'
import { useRouter }    from 'next/navigation'
import { useForm }      from 'react-hook-form'
import { zodResolver }  from '@hookform/resolvers/zod'
import { z }            from 'zod'
import { api, setTokens } from '@/lib/api'

const LoginSchema = z.object({
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
type LoginForm = z.infer<typeof LoginSchema>

export default function LoginPage() {
  const router   = useRouter()
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(LoginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    setError(null)
    try {
      const res = await api.post('/auth/login', data)
      setTokens(res.data.accessToken, res.data.refreshToken)
      router.push('/deals')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Login failed. Check your credentials and try again.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-card border rounded-lg p-8 shadow-sm">
          <h1 className="text-2xl font-semibold mb-1">Sign in</h1>
          <p className="text-muted-foreground text-sm mb-6">Enter your credentials to continue</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">Email</label>
              <input
                type="email"
                autoComplete="email"
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...register('email')}
              />
              {errors.email && <p className="text-destructive text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...register('password')}
              />
              {errors.password && <p className="text-destructive text-xs mt-1">{errors.password.message}</p>}
            </div>

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
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-4">
            No account?{' '}
            <a href="/register" className="text-primary hover:underline">Create one</a>
          </p>
        </div>
      </div>
    </div>
  )
}
