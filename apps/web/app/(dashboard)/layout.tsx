'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, Users, Building2, DollarSign, Activity, CheckSquare,
  MessageSquare, Mail, Phone, Mic, CalendarDays, CalendarCheck,
  Zap, GitBranch, BookOpen, FileCode, Sparkles, Bot, Database, Lightbulb,
  Target, Megaphone, Globe, FileText, ClipboardList, Briefcase, Layout,
  LifeBuoy, FolderKanban, Receipt, Package, UserCog, BarChart2, TrendingUp,
  Shield, Clock, Key, CreditCard, Settings, ChevronRight, Search,
  PanelLeft, Star, X, LogOut, ChevronDown, Kanban, Handshake, BarChart3,
  Brain, Inbox, Webhook, Bell, Check, MessageCircle, Network,
} from 'lucide-react'
import { getAccessToken, clearTokens, setTokens, api } from '@/lib/api'

// ── Module registry — set false to hide a section ────────────────────────────
const MODULES = {
  crm:            true,
  communications: true,
  automation:     true,
  ai_hub:         true,
  growth:         true,
  operations:     true,
  analytics:      true,
} as const
type ModKey = keyof typeof MODULES

// ── Types ─────────────────────────────────────────────────────────────────────
interface NavItem {
  id: string; label: string; href: string
  icon: React.ElementType
  badge?: string; badgeColor?: 'violet' | 'green' | 'gray'
}
interface NavSection {
  id: string; moduleKey: ModKey; label: string
  icon: React.ElementType; color: string
  items: NavItem[]
}
interface Workspace { id: string; name: string; role: string }

// ── Navigation config ─────────────────────────────────────────────────────────
const SECTIONS: NavSection[] = [
  {
    id: 'crm', moduleKey: 'crm', label: 'CRM',
    icon: Users, color: '#3B82F6',
    items: [
      { id: 'pipeline',   label: 'Pipeline',   href: '/deals',     icon: Kanban      },
      { id: 'contacts',   label: 'Contacts',   href: '/contacts',  icon: Users       },
      { id: 'companies',  label: 'Companies',  href: '/companies', icon: Building2,  badge: 'New', badgeColor: 'green' },
      { id: 'deals',      label: 'Deals',      href: '/deals',     icon: Handshake   },
      { id: 'activities', label: 'Activities', href: '/activities',icon: Activity,   badge: 'New', badgeColor: 'green' },
      { id: 'tasks',      label: 'Tasks',      href: '/tasks',     icon: CheckSquare,badge: 'New', badgeColor: 'green' },
    ],
  },
  {
    id: 'communications', moduleKey: 'communications', label: 'Communications',
    icon: MessageSquare, color: '#10B981',
    items: [
      { id: 'inbox',    label: 'Unified Inbox', href: '/inbox',    icon: Inbox          },
      { id: 'email',    label: 'Email',         href: '/inbox',    icon: Mail           },
      { id: 'whatsapp', label: 'WhatsApp',      href: '/inbox',    icon: MessageCircle  },
      { id: 'voice',    label: 'Voice AI',      href: '/voice',    icon: Mic,    badge: 'AI', badgeColor: 'violet' },
      { id: 'calendar', label: 'Calendar',      href: '/calendar', icon: CalendarDays,  badge: 'New', badgeColor: 'green' },
      { id: 'bookings', label: 'Bookings',      href: '/bookings', icon: CalendarCheck  },
    ],
  },
  {
    id: 'automation', moduleKey: 'automation', label: 'Automation',
    icon: Zap, color: '#F59E0B',
    items: [
      { id: 'workflows', label: 'Workflow Builder', href: '/workflows',          icon: GitBranch  },
      { id: 'ai-wf',    label: 'AI Generator',     href: '/workflows',          icon: Sparkles,  badge: 'AI',   badgeColor: 'violet' },
      { id: 'templates', label: 'Templates',        href: '/workflows',          icon: BookOpen   },
      { id: 'webhooks',  label: 'Webhooks',         href: '/settings/api',      icon: Webhook    },
    ],
  },
  {
    id: 'ai_hub', moduleKey: 'ai_hub', label: 'AI Hub',
    icon: Sparkles, color: '#8B5CF6',
    items: [
      { id: 'copilot',   label: 'AI Copilot',     href: '/ai/copilot',   icon: Sparkles, badge: 'AI', badgeColor: 'violet' },
      { id: 'agents',    label: 'AI Agents',      href: '/ai/agents',    icon: Bot,      badge: 'New',badgeColor: 'green'  },
      { id: 'memory',    label: 'AI Memory',      href: '/ai/memory',    icon: Database                                   },
      { id: 'knowledge', label: 'Knowledge Base', href: '/ai/knowledge', icon: BookOpen                                   },
      { id: 'prompts',   label: 'Prompt Library', href: '/ai/prompts',   icon: FileCode                                   },
      { id: 'insights',  label: 'AI Insights',    href: '/ai/insights',  icon: Brain,    badge: 'AI', badgeColor: 'violet' },
    ],
  },
  {
    id: 'growth', moduleKey: 'growth', label: 'Growth',
    icon: TrendingUp, color: '#EF4444',
    items: [
      { id: 'leads',     label: 'Lead Generation', href: '/leads',     icon: Target    },
      { id: 'campaigns', label: 'Campaigns',     href: '/campaigns', icon: Megaphone,     badge: 'New',  badgeColor: 'green' },
      { id: 'pages',    label: 'Landing Pages', href: '/pages',     icon: Layout,        badge: 'Soon', badgeColor: 'gray'  },
      { id: 'forms',    label: 'Forms',         href: '/forms',     icon: FileText,      badge: 'Soon', badgeColor: 'gray'  },
      { id: 'surveys',  label: 'Surveys',       href: '/surveys',   icon: ClipboardList, badge: 'Soon', badgeColor: 'gray'  },
    ],
  },
  {
    id: 'operations', moduleKey: 'operations', label: 'Operations',
    icon: Briefcase, color: '#F97316',
    items: [
      { id: 'helpdesk',  label: 'Helpdesk',  href: '/tickets',   icon: LifeBuoy     },
      { id: 'projects',  label: 'Projects',  href: '/projects',  icon: FolderKanban },
      { id: 'invoices',  label: 'Invoices',  href: '/invoices',  icon: Receipt      },
      { id: 'inventory', label: 'Inventory', href: '/inventory', icon: Package      },
      { id: 'hr',        label: 'HR',        href: '/hr',        icon: UserCog      },
    ],
  },
  {
    id: 'analytics', moduleKey: 'analytics', label: 'Analytics',
    icon: BarChart2, color: '#6366F1',
    items: [
      { id: 'overview',  label: 'Overview',     href: '/analytics',          icon: BarChart3   },
      { id: 'sales',     label: 'Sales',        href: '/analytics/sales',    icon: TrendingUp  },
      { id: 'revenue',   label: 'Revenue',      href: '/analytics/revenue',  icon: DollarSign  },
      { id: 'forecast',  label: 'Forecast',     href: '/analytics/forecast', icon: Target      },
      { id: 'ai-report', label: 'AI Analytics', href: '/analytics/ai',       icon: Brain, badge: 'AI', badgeColor: 'violet' },
    ],
  },
]

// Badge style map
const BADGE_STYLE = {
  violet: 'bg-violet-100 text-violet-600',
  green:  'bg-emerald-100 text-emerald-600',
  gray:   'bg-gray-100 text-gray-400',
}

// ── Main layout ───────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()

  // Auth state
  const [user,          setUser]          = useState<{ name: string; email: string } | null>(null)
  const [workspaces,    setWorkspaces]    = useState<Workspace[]>([])
  const [currentWsName, setCurrentWsName] = useState('')

  // Sidebar state
  const [collapsed,    setCollapsed]    = useState(false)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())
  const [wsOpen,       setWsOpen]       = useState(false)

  // Command palette
  const [cmdOpen,    setCmdOpen]    = useState(false)
  const [cmdQuery,   setCmdQuery]   = useState('')
  const cmdInputRef = useRef<HTMLInputElement>(null)

  // Favorites & recent (localStorage)
  const [favorites,    setFavorites]    = useState<string[]>([])
  const [recentPages,  setRecentPages]  = useState<{ href: string; label: string }[]>([])

  // AI search (header)
  const [aiQuery,    setAiQuery]    = useState('')
  const [aiResult,   setAiResult]   = useState<string | null>(null)
  const [aiLoading,  setAiLoading]  = useState(false)

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!getAccessToken()) { router.push('/login'); return }
    Promise.all([
      api.get('/auth/me'),
      api.get<Workspace[]>('/auth/workspaces'),
      api.get<{ name: string }>('/team/workspace'),
    ]).then(([me, ws, cur]) => {
      setUser(me.data)
      setWorkspaces(ws.data)
      setCurrentWsName(cur.data.name)
    }).catch(() => router.push('/login'))
  }, [router])

  // ── Auto-open section for active route ─────────────────────────────────────
  useEffect(() => {
    const active = SECTIONS.find(s => s.items.some(i => pathname === i.href || (i.href !== '/' && pathname.startsWith(i.href))))
    if (active) setOpenSections(prev => new Set([...prev, active.id]))
  }, [pathname])

  // ── Track recent pages ─────────────────────────────────────────────────────
  useEffect(() => {
    const allItems = SECTIONS.flatMap(s => s.items)
    const match = allItems.find(i => pathname === i.href || (i.href !== '/' && pathname.startsWith(i.href)))
    if (match) {
      setRecentPages(prev => {
        const filtered = prev.filter(p => p.href !== match.href).slice(0, 4)
        return [{ href: match.href, label: match.label }, ...filtered]
      })
    }
  }, [pathname])

  // ── Load favorites ─────────────────────────────────────────────────────────
  useEffect(() => {
    try { const s = localStorage.getItem('crm-favorites'); if (s) setFavorites(JSON.parse(s)) } catch {}
  }, [])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(v => !v) }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); setCollapsed(v => !v) }
      if (e.key === 'Escape') { setCmdOpen(false); setWsOpen(false); setAiResult(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { if (cmdOpen) { setTimeout(() => cmdInputRef.current?.focus(), 50) } }, [cmdOpen])

  // ── Handlers ───────────────────────────────────────────────────────────────
  function toggleSection(id: string) {
    if (collapsed) { setCollapsed(false); setOpenSections(new Set([id])); return }
    setOpenSections(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleFavorite(href: string, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    setFavorites(prev => {
      const next = prev.includes(href) ? prev.filter(f => f !== href) : [...prev, href]
      localStorage.setItem('crm-favorites', JSON.stringify(next))
      return next
    })
  }

  async function handleLogout() {
    const rt = localStorage.getItem('refresh_token')
    if (rt) await api.post('/auth/logout', { refreshToken: rt }).catch(() => {})
    clearTokens(); router.push('/login')
  }

  async function switchWorkspace(ws: Workspace) {
    const res = await api.post<{ accessToken: string }>('/auth/switch-workspace', { tenantId: ws.id })
    setTokens(res.data.accessToken, localStorage.getItem('refresh_token') ?? '')
    setCurrentWsName(ws.name); setWsOpen(false); router.refresh()
  }

  async function handleAiSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!aiQuery.trim()) return
    setAiLoading(true); setAiResult(null)
    try {
      const res = await api.post('/ai/search', { query: aiQuery })
      setAiResult(res.data.answer)
    } catch { setAiResult('AI search unavailable. Add OPENAI_API_KEY to .env to enable.') }
    finally { setAiLoading(false) }
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  function isActive(href: string) {
    return pathname === href || (href !== '/' && pathname.startsWith(href))
  }

  const visibleSections = SECTIONS.filter(s => MODULES[s.moduleKey])

  const cmdResults = useMemo(() => {
    if (!cmdQuery.trim()) return []
    const q = cmdQuery.toLowerCase()
    return visibleSections.flatMap(s =>
      s.items.filter(i => i.label.toLowerCase().includes(q) || s.label.toLowerCase().includes(q))
        .map(i => ({ ...i, sectionLabel: s.label }))
    ).slice(0, 8)
  }, [cmdQuery, visibleSections])

  const allItems = useMemo(() => visibleSections.flatMap(s => s.items), [visibleSections])
  const favoriteItems = allItems.filter(i => favorites.includes(i.href))

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center">
          <Sparkles size={16} className="text-white animate-pulse"/>
        </div>
        <p className="text-sm text-gray-400">Loading workspace…</p>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-[#F7F8FA] overflow-hidden">

      {/* ══════════════════════════════════════════════════════
          SIDEBAR
      ══════════════════════════════════════════════════════ */}
      <aside className={`flex flex-col bg-white border-r border-gray-100/80 shrink-0 transition-[width] duration-200 ease-in-out select-none ${collapsed ? 'w-[56px]' : 'w-[220px]'}`}>

        {/* ── Logo bar ─────────────────────────────────────────── */}
        <div className="flex items-center h-[52px] px-3 border-b border-gray-100/80 shrink-0 gap-2">
          {/* Logo mark */}
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shrink-0 shadow-sm">
            <Sparkles size={13} className="text-white"/>
          </div>

          {!collapsed && (
            <>
              {/* Workspace switcher */}
              <div className="relative flex-1 min-w-0">
                <button onClick={() => setWsOpen(v => !v)}
                  className="flex items-center gap-1.5 w-full group">
                  <span className="text-[13px] font-semibold text-gray-900 truncate">
                    {currentWsName || 'Workspace'}
                  </span>
                  <ChevronDown size={11} className="text-gray-400 group-hover:text-gray-600 transition-colors shrink-0"/>
                </button>

                {wsOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setWsOpen(false)}/>
                    <div className="absolute top-6 left-0 z-50 min-w-[190px] bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 mt-1">
                      <p className="px-3 pt-1 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Switch workspace</p>
                      {workspaces.map(ws => (
                        <button key={ws.id} onClick={() => switchWorkspace(ws)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-violet-50 text-left transition-colors">
                          <UserAvatar name={ws.name} size="xs"/>
                          <span className="flex-1 font-medium text-gray-800 truncate">{ws.name}</span>
                          {ws.name === currentWsName && <Check size={12} className="text-violet-500 shrink-0"/>}
                        </button>
                      ))}
                      <div className="border-t border-gray-100 mt-1 pt-1 px-2">
                        <button className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">
                          <span className="text-base leading-none">＋</span> New workspace
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* Collapse toggle */}
          <button onClick={() => setCollapsed(v => !v)}
            className={`${collapsed ? 'mx-auto' : 'ml-auto'} p-1.5 rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-all`}
            title={collapsed ? 'Expand (⌘B)' : 'Collapse (⌘B)'}>
            <PanelLeft size={13} className={collapsed ? 'rotate-180' : ''}/>
          </button>
        </div>

        {/* ── Search ───────────────────────────────────────────── */}
        <div className={`${collapsed ? 'px-2 py-2' : 'px-2.5 py-2'} shrink-0`}>
          {collapsed ? (
            <button onClick={() => { setCollapsed(false); setCmdOpen(true) }}
              className="w-full flex justify-center p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
              <Search size={14}/>
            </button>
          ) : (
            <button onClick={() => setCmdOpen(true)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100 hover:border-gray-200 text-gray-400 text-xs transition-all group">
              <Search size={11}/>
              <span className="flex-1 text-left">Search…</span>
              <kbd className="text-[9px] font-mono bg-white border border-gray-200 px-1.5 py-0.5 rounded group-hover:border-gray-300 transition-colors">⌘K</kbd>
            </button>
          )}
        </div>

        {/* ── Scrollable nav ────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 space-y-0.5 scrollbar-none">

          {/* Dashboard */}
          <NavLink href="/" icon={LayoutDashboard} label="Dashboard"
            active={pathname === '/'} collapsed={collapsed}
            fav={favorites.includes('/')} onToggleFav={e => toggleFavorite('/', e)}/>

          {/* Sections */}
          {visibleSections.map(section => (
            <SidebarSection
              key={section.id} section={section}
              isOpen={openSections.has(section.id)}
              collapsed={collapsed}
              isCurrentSection={section.items.some(i => isActive(i.href))}
              onToggle={() => toggleSection(section.id)}
              isActive={isActive}
              favorites={favorites}
              onToggleFav={toggleFavorite}
            />
          ))}

          {/* Divider */}
          <div className="mx-1 my-2 border-t border-gray-100"/>

          {/* Settings */}
          <NavLink href="/settings" icon={Settings} label="Settings"
            active={pathname.startsWith('/settings')} collapsed={collapsed}/>
        </nav>

        {/* ── User profile ──────────────────────────────────────── */}
        <div className="border-t border-gray-100/80 p-2 shrink-0">
          {collapsed ? (
            <div className="flex justify-center py-1">
              <UserAvatar name={user.name} size="sm"/>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg group hover:bg-gray-50 transition-colors">
              <UserAvatar name={user.name} size="sm"/>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-gray-800 truncate">{user.name}</p>
                <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
              </div>
              <button onClick={handleLogout} title="Sign out"
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-rose-500 transition-all shrink-0">
                <LogOut size={12}/>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ══════════════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Top header bar ────────────────────────────────────── */}
        <header className="h-[52px] bg-white border-b border-gray-100/80 px-5 flex items-center gap-4 shrink-0">
          {/* AI Search */}
          <form onSubmit={handleAiSearch} className="flex items-center gap-2 flex-1 max-w-lg">
            <div className="relative flex-1">
              <Sparkles size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-400"/>
              <input
                value={aiQuery} onChange={e => setAiQuery(e.target.value)}
                placeholder='Ask AI… "show deals over $10k closed this month"'
                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-8 pr-8 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 placeholder:text-gray-400 transition-all"
              />
              {aiQuery && (
                <button type="button" onClick={() => { setAiQuery(''); setAiResult(null) }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={11}/>
                </button>
              )}
            </div>
            <button type="submit" disabled={aiLoading || !aiQuery.trim()}
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg px-3.5 py-1.5 text-[12px] font-semibold transition-colors shrink-0">
              {aiLoading
                ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                : <Sparkles size={11}/>
              }
              {aiLoading ? '' : 'Ask AI'}
            </button>
          </form>

          {/* Right actions */}
          <div className="flex items-center gap-2 ml-auto">
            <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all relative">
              <Bell size={15}/>
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-violet-500 rounded-full"/>
            </button>
            <div className="w-px h-5 bg-gray-200"/>
            <div className="flex items-center gap-2 px-2">
              <UserAvatar name={user.name} size="sm"/>
              <span className="text-[12px] font-medium text-gray-700 hidden sm:block">{user.name}</span>
            </div>
          </div>
        </header>

        {/* AI result banner */}
        {aiResult && (
          <div className="bg-violet-50 border-b border-violet-100 px-5 py-3 flex items-start gap-3 shrink-0">
            <Sparkles size={14} className="text-violet-500 mt-0.5 shrink-0"/>
            <p className="text-[13px] text-violet-800 flex-1">{aiResult}</p>
            <button onClick={() => setAiResult(null)} className="text-violet-400 hover:text-violet-600 shrink-0">
              <X size={13}/>
            </button>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* ══════════════════════════════════════════════════════
          COMMAND PALETTE  ⌘K
      ══════════════════════════════════════════════════════ */}
      {cmdOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-start justify-center pt-20 px-4"
          onClick={() => { setCmdOpen(false); setCmdQuery('') }}>
          <div className="w-full max-w-[540px] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
            onClick={e => e.stopPropagation()}>

            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
              <Search size={15} className="text-gray-400 shrink-0"/>
              <input
                ref={cmdInputRef} value={cmdQuery} onChange={e => setCmdQuery(e.target.value)}
                placeholder="Search pages, modules, actions…"
                className="flex-1 text-[14px] outline-none text-gray-800 placeholder:text-gray-400"/>
              {cmdQuery && (
                <button onClick={() => setCmdQuery('')} className="text-gray-400 hover:text-gray-600">
                  <X size={13}/>
                </button>
              )}
              <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 font-mono shrink-0">Esc</kbd>
            </div>

            {/* Results */}
            <div className="max-h-[360px] overflow-y-auto py-2">
              {!cmdQuery && favoriteItems.length > 0 && (
                <CmdGroup label="★ Starred" items={favoriteItems.map(i => ({ ...i, sectionLabel: '' }))}
                  onClose={() => { setCmdOpen(false); setCmdQuery('') }}/>
              )}
              {!cmdQuery && recentPages.length > 0 && (
                <CmdGroup
                  label="Recently visited"
                  items={recentPages.map(p => {
                    const found = allItems.find(i => i.href === p.href)
                    return found ? { ...found, sectionLabel: '' } : { id: p.href, label: p.label, href: p.href, icon: Clock, sectionLabel: '' }
                  })}
                  onClose={() => { setCmdOpen(false); setCmdQuery('') }}
                />
              )}
              {!cmdQuery && visibleSections.map(s => (
                <CmdGroup key={s.id}
                  label={s.label}
                  items={s.items.map(i => ({ ...i, sectionLabel: s.label }))}
                  onClose={() => { setCmdOpen(false); setCmdQuery('') }}
                />
              ))}
              {cmdQuery && cmdResults.length > 0 && (
                <CmdGroup label="Results"
                  items={cmdResults.map(i => ({ ...i, sectionLabel: i.sectionLabel }))}
                  onClose={() => { setCmdOpen(false); setCmdQuery('') }}
                />
              )}
              {cmdQuery && cmdResults.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-[13px] text-gray-400">No results for "<span className="text-gray-600">{cmdQuery}</span>"</p>
                </div>
              )}
            </div>

            {/* Footer hints */}
            <div className="border-t border-gray-100 px-4 py-2.5 flex items-center gap-4">
              {[['↑↓','Navigate'],['↵','Open'],['Esc','Close']].map(([key, hint]) => (
                <span key={key} className="flex items-center gap-1.5 text-[10px] text-gray-400">
                  <kbd className="border border-gray-200 rounded px-1.5 py-0.5 font-mono text-[9px] text-gray-500">{key}</kbd> {hint}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// SIDEBAR SECTION
// ══════════════════════════════════════════════════════════
function SidebarSection({ section, isOpen, collapsed, isCurrentSection, onToggle, isActive, favorites, onToggleFav }: {
  section: NavSection; isOpen: boolean; collapsed: boolean
  isCurrentSection: boolean; onToggle: () => void
  isActive: (href: string) => boolean
  favorites: string[]; onToggleFav: (href: string, e: React.MouseEvent) => void
}) {
  const SIcon = section.icon

  if (collapsed) {
    return (
      <button onClick={onToggle} title={section.label}
        className={`w-full flex justify-center p-2 rounded-lg transition-all ${isCurrentSection ? 'text-violet-600 bg-violet-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
        <SIcon size={15}/>
      </button>
    )
  }

  return (
    <div>
      {/* Section header */}
      <button onClick={onToggle}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all group ${isCurrentSection ? 'text-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
        <SIcon size={13} style={{ color: isCurrentSection ? section.color : undefined }}/>
        <span className={`flex-1 text-[11px] font-semibold tracking-wide ${isCurrentSection ? 'text-gray-700' : ''}`}>
          {section.label.toUpperCase()}
        </span>
        <ChevronRight size={11} className={`transition-transform duration-150 shrink-0 ${isOpen ? 'rotate-90' : ''}`}/>
      </button>

      {/* Section items — animated expand */}
      <div style={{
        maxHeight: isOpen ? '600px' : '0',
        overflow: 'hidden',
        transition: 'max-height 200ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <div className="pl-1 pr-1 pt-0.5 pb-1 space-y-0.5">
          {section.items.map(item => (
            <NavLink key={item.id}
              href={item.href} icon={item.icon} label={item.label}
              active={isActive(item.href)} collapsed={false}
              badge={item.badge} badgeColor={item.badgeColor}
              fav={favorites.includes(item.href)}
              onToggleFav={e => onToggleFav(item.href, e)}
              indent
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// NAV LINK
// ══════════════════════════════════════════════════════════
function NavLink({ href, icon: Icon, label, active, collapsed, badge, badgeColor = 'gray', fav, onToggleFav, indent }: {
  href: string; icon: React.ElementType; label: string; active: boolean; collapsed: boolean
  badge?: string; badgeColor?: 'violet' | 'green' | 'gray'
  fav?: boolean; onToggleFav?: (e: React.MouseEvent) => void
  indent?: boolean
}) {
  return (
    <Link href={href} title={collapsed ? label : undefined}
      className={`group flex items-center gap-2 rounded-lg transition-all duration-100 ${
        indent ? 'px-3 py-1.5' : 'px-2.5 py-1.5'
      } ${
        active
          ? 'bg-violet-50 text-violet-700'
          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
      } ${collapsed ? 'justify-center' : ''}`}
    >
      <Icon size={13} className={`shrink-0 transition-colors ${active ? 'text-violet-600' : 'text-gray-400 group-hover:text-gray-600'}`}/>
      {!collapsed && (
        <>
          <span className="flex-1 text-[12.5px] font-medium truncate">{label}</span>
          {badge && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 leading-tight ${BADGE_STYLE[badgeColor]}`}>
              {badge}
            </span>
          )}
          {onToggleFav && (
            <button onClick={onToggleFav}
              className={`shrink-0 transition-all ${fav ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
              <Star size={10} className={fav ? 'fill-amber-400 text-amber-400' : 'text-gray-300 hover:text-amber-300'}/>
            </button>
          )}
        </>
      )}
    </Link>
  )
}

// ══════════════════════════════════════════════════════════
// COMMAND PALETTE GROUP
// ══════════════════════════════════════════════════════════
function CmdGroup({ label, items, onClose }: {
  label: string
  items: (NavItem & { sectionLabel: string })[]
  onClose: () => void
}) {
  if (items.length === 0) return null
  return (
    <div className="mb-1">
      <p className="px-4 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
      {items.map(item => {
        const IIcon = item.icon
        return (
          <Link key={item.href + item.id} href={item.href} onClick={onClose}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-violet-50 transition-colors group cursor-pointer">
            <div className="w-7 h-7 rounded-lg bg-gray-100 group-hover:bg-violet-100 flex items-center justify-center transition-colors shrink-0">
              <IIcon size={13} className="text-gray-500 group-hover:text-violet-600 transition-colors"/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-gray-800 group-hover:text-violet-700 transition-colors">{item.label}</p>
              {item.sectionLabel && <p className="text-[10px] text-gray-400">{item.sectionLabel}</p>}
            </div>
            <ChevronRight size={12} className="text-gray-300 group-hover:text-violet-400 transition-colors shrink-0"/>
          </Link>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// USER AVATAR
// ══════════════════════════════════════════════════════════
function UserAvatar({ name, size = 'sm' }: { name: string; size?: 'xs' | 'sm' | 'md' }) {
  const COLORS = ['bg-violet-500','bg-blue-500','bg-emerald-500','bg-rose-500','bg-amber-500','bg-indigo-500']
  const color = COLORS[(name.charCodeAt(0) ?? 0) % COLORS.length]
  const sz = size === 'xs' ? 'w-5 h-5 text-[9px]' : size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs'
  return (
    <div className={`${color} ${sz} rounded-full flex items-center justify-center text-white font-bold shrink-0`}>
      {(name[0] ?? '?').toUpperCase()}
    </div>
  )
}
