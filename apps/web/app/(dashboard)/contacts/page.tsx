'use client'

import { useState }   from 'react'
import Link           from 'next/link'
import { useQuery }   from '@tanstack/react-query'
import { contactsApi, type Contact } from '@/lib/api'
import { Plus, Search, Building2, Mail } from 'lucide-react'

export default function ContactsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage]     = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', search, page],
    queryFn:  () => contactsApi.list({ search, page: String(page), limit: '50' }).then(r => r.data),
  })

  const contacts = data?.contacts ?? []
  const total    = data?.total ?? 0

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {total > 0 ? `${total} total` : 'No contacts yet'}
          </p>
        </div>
        <Link
          href="/contacts/new"
          className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus size={14} /> Add contact
        </Link>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search contacts…"
          className="w-full border rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {isLoading ? (
        <EmptyState loading />
      ) : contacts.length === 0 ? (
        <EmptyState search={search} />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {['Name', 'Email', 'Company', 'Deals', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {contacts.map((contact: Contact) => (
                <tr key={contact.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/contacts/${contact.id}`} className="hover:text-primary">
                      {contact.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {contact.email ? (
                      <span className="flex items-center gap-1">
                        <Mail size={12} /> {contact.email}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {contact.company ? (
                      <span className="flex items-center gap-1">
                        <Building2 size={12} /> {contact.company}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {contact._count?.deals ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="text-primary text-xs hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function EmptyState({ loading, search }: { loading?: boolean; search?: string }) {
  if (loading) return (
    <div className="border rounded-lg p-12 text-center text-muted-foreground text-sm">
      Loading…
    </div>
  )
  return (
    <div className="border rounded-lg p-12 text-center">
      <div className="text-muted-foreground text-sm">
        {search
          ? `No contacts match "${search}"`
          : 'No contacts yet. Add your first contact to get started.'}
      </div>
      {!search && (
        <Link
          href="/contacts/new"
          className="mt-3 inline-flex items-center gap-1 bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm"
        >
          <Plus size={13} /> Add contact
        </Link>
      )}
    </div>
  )
}
