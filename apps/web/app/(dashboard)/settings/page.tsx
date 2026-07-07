'use client'

import { useState }     from 'react'
import { useForm }      from 'react-hook-form'
import { zodResolver }  from '@hookform/resolvers/zod'
import { z }            from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api }          from '@/lib/api'
import { UserPlus, Trash2, Crown, Shield, Copy, Check } from 'lucide-react'

// ── API helpers ───────────────────────────────────────────────────────────────
const teamApi = {
  workspace:       () => api.get<{ id: string; name: string; subdomain?: string; plan: string }>('/team/workspace'),
  updateWorkspace: (d: { name?: string; subdomain?: string }) => api.patch('/team/workspace', d),
  members:         () => api.get<{ id: string; role: string; joinedAt: string; user: { id: string; name: string; email: string } }[]>('/team/members'),
  updateRole:      (userId: string, role: string) => api.patch(`/team/members/${userId}/role`, { role }),
  removeMember:    (userId: string) => api.delete(`/team/members/${userId}`),
  invitations:     () => api.get<{ id: string; email: string; role: string; expiresAt: string; creator: { name: string } }[]>('/team/invitations'),
  invite:          (d: { email: string; role: string }) => api.post<{ inviteUrl: string }>('/team/invitations', d),
  revokeInvite:    (id: string) => api.delete(`/team/invitations/${id}`),
}

const workspaceSchema = z.object({
  name:      z.string().min(1).max(100),
  subdomain: z.string().min(2).max(63).regex(/^[a-z0-9-]+$/, 'Lowercase, numbers, hyphens only').optional().or(z.literal('')),
})

const inviteSchema = z.object({
  email: z.string().email('Valid email required'),
  role:  z.enum(['ADMIN', 'MEMBER']),
})

export default function SettingsPage() {
  const qc = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [copiedUrl, setCopiedUrl]   = useState<string | null>(null)

  const { data: workspace } = useQuery({ queryKey: ['workspace'],   queryFn: () => teamApi.workspace().then(r => r.data) })
  const { data: members = [] } = useQuery({ queryKey: ['members'],  queryFn: () => teamApi.members().then(r => r.data) })
  const { data: invites = [] } = useQuery({ queryKey: ['invites'],  queryFn: () => teamApi.invitations().then(r => r.data) })

  const wsForm = useForm({ resolver: zodResolver(workspaceSchema), values: { name: workspace?.name ?? '', subdomain: workspace?.subdomain ?? '' } })

  const inviteForm = useForm({ resolver: zodResolver(inviteSchema), defaultValues: { email: '', role: 'MEMBER' as const } })

  const updateWs = useMutation({
    mutationFn: (d: { name?: string; subdomain?: string }) => teamApi.updateWorkspace(d),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['workspace'] }),
  })

  const inviteMut = useMutation({
    mutationFn: (d: { email: string; role: string }) => teamApi.invite(d),
    onSuccess:  (res) => {
      qc.invalidateQueries({ queryKey: ['invites'] })
      inviteForm.reset({ email: '', role: 'MEMBER' })
      setInviteOpen(false)
      copyToClipboard(res.data.inviteUrl)
    },
  })

  const removeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) => teamApi.updateRole(userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })

  const removeMember = useMutation({
    mutationFn: (userId: string) => teamApi.removeMember(userId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['members'] }),
  })

  const revokeInvite = useMutation({
    mutationFn: (id: string) => teamApi.revokeInvite(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['invites'] }),
  })

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(url)
      setTimeout(() => setCopiedUrl(null), 2000)
    })
  }

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* Workspace */}
      <section className="border rounded-lg p-5">
        <h2 className="font-semibold mb-4">Workspace</h2>
        <form onSubmit={wsForm.handleSubmit(d => updateWs.mutate(d))} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Workspace name</label>
            <input {...wsForm.register('name')}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {wsForm.formState.errors.name && <p className="text-destructive text-xs mt-1">{wsForm.formState.errors.name.message}</p>}
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Subdomain <span className="text-muted-foreground font-normal">(optional)</span></label>
            <div className="flex items-center gap-1">
              <input {...wsForm.register('subdomain')}
                placeholder="mycompany"
                className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-sm text-muted-foreground">.crm.app</span>
            </div>
            {wsForm.formState.errors.subdomain && <p className="text-destructive text-xs mt-1">{wsForm.formState.errors.subdomain.message}</p>}
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={updateWs.isPending}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
            >{updateWs.isPending ? 'Saving…' : 'Save changes'}</button>
            {updateWs.isSuccess && <span className="text-green-600 text-sm">Saved!</span>}
            {updateWs.error && <span className="text-destructive text-sm">Failed to save. Subdomain may be taken.</span>}
          </div>
        </form>
      </section>

      {/* Team members */}
      <section className="border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Team members <span className="text-muted-foreground font-normal text-sm">({members.length})</span></h2>
          <button onClick={() => setInviteOpen(true)}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium"
          ><UserPlus size={14} /> Invite</button>
        </div>

        {inviteOpen && (
          <form onSubmit={inviteForm.handleSubmit(d => inviteMut.mutate(d))}
            className="bg-muted/40 rounded-lg p-4 mb-4 space-y-3"
          >
            <h3 className="text-sm font-medium">Invite team member</h3>
            <div className="flex gap-2">
              <input {...inviteForm.register('email')}
                placeholder="colleague@company.com"
                className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              />
              <select {...inviteForm.register('role')}
                className="border rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              >
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            {inviteForm.formState.errors.email && (
              <p className="text-destructive text-xs">{inviteForm.formState.errors.email.message}</p>
            )}
            {inviteMut.error && <p className="text-destructive text-xs">Failed. Email may already be a member.</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setInviteOpen(false)}
                className="flex-1 border rounded px-3 py-1.5 text-sm hover:bg-muted"
              >Cancel</button>
              <button type="submit" disabled={inviteMut.isPending}
                className="flex-1 bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >{inviteMut.isPending ? 'Sending…' : 'Send invite'}</button>
            </div>
          </form>
        )}

        <div className="divide-y">
          {members.map(m => (
            <div key={m.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  {m.user.name}
                  {m.role === 'ADMIN' && <Crown size={12} className="text-amber-500" />}
                </p>
                <p className="text-xs text-muted-foreground">{m.user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={m.role}
                  onChange={e => removeRole.mutate({ userId: m.user.id, role: e.target.value })}
                  className="border rounded px-2 py-1 text-xs focus:outline-none"
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <button
                  onClick={() => { if (confirm(`Remove ${m.user.name} from workspace?`)) removeMember.mutate(m.user.id) }}
                  className="text-muted-foreground hover:text-destructive p-1"
                ><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pending invitations */}
      {invites.length > 0 && (
        <section className="border rounded-lg p-5">
          <h2 className="font-semibold mb-4">Pending Invitations</h2>
          <div className="divide-y">
            {invites.map(inv => {
              const inviteUrl = `${window.location.origin}/invite?token=${inv.id}`
              return (
                <div key={inv.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {inv.role} · invited by {inv.creator.name} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => copyToClipboard(inviteUrl)}
                      className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-muted"
                      title="Copy invite link"
                    >
                      {copiedUrl === inviteUrl ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                    </button>
                    <button onClick={() => revokeInvite.mutate(inv.id)}
                      className="text-muted-foreground hover:text-destructive p-1.5 rounded hover:bg-muted"
                    ><Trash2 size={14} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Plan */}
      <section className="border rounded-lg p-5">
        <h2 className="font-semibold mb-2">Plan</h2>
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-primary" />
          <span className="text-sm capitalize">{workspace?.plan ?? 'trial'}</span>
        </div>
      </section>
    </div>
  )
}
