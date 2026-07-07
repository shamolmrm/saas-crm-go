'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Bot, Database, BookOpen, FileCode, Brain, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react'

const PAGE_CONFIG: Record<string, {
  icon: React.ElementType; title: string; subtitle: string
  color: string; gradient: string; eta: string
  features: string[]
}> = {
  agents: {
    icon: Bot, title: 'AI Agents', subtitle: 'Autonomous AI workers that run tasks 24/7',
    color: 'text-violet-600', gradient: 'from-violet-500 to-violet-700', eta: 'Q3 2026',
    features: [
      'Configure agents with goals, tools, and memory',
      'Agents can send emails, create records, update deals',
      'Multi-agent workflows with handoffs and escalations',
      'Human-in-the-loop approval gates',
      'Full audit trail of agent actions',
    ],
  },
  memory: {
    icon: Database, title: 'AI Memory', subtitle: 'Long-term context and knowledge storage',
    color: 'text-blue-600', gradient: 'from-blue-500 to-blue-700', eta: 'Q3 2026',
    features: [
      'Store facts about contacts, deals, and conversations',
      'AI remembers context across sessions',
      'Custom memory namespaces per tenant',
      'Search and retrieval with semantic similarity',
      'Auto-summarize long conversation histories',
    ],
  },
  knowledge: {
    icon: BookOpen, title: 'Knowledge Base', subtitle: 'Upload documents for AI to learn from',
    color: 'text-emerald-600', gradient: 'from-emerald-500 to-emerald-700', eta: 'Q4 2026',
    features: [
      'Upload PDFs, Word docs, and web pages',
      'AI can answer questions from your documents',
      'Automatic chunking and embedding via RAG',
      'Cite sources in AI answers',
      'Attach knowledge to specific workflows',
    ],
  },
  prompts: {
    icon: FileCode, title: 'Prompt Library', subtitle: 'Save and reuse your best AI prompts',
    color: 'text-amber-600', gradient: 'from-amber-500 to-amber-600', eta: 'Q4 2026',
    features: [
      'Save prompts with variables and templates',
      'Share prompts across your team',
      'Version control for prompt iterations',
      'Prompt performance analytics',
      'One-click use in any AI feature',
    ],
  },
  insights: {
    icon: Brain, title: 'AI Insights', subtitle: 'Predictive analytics powered by AI',
    color: 'text-indigo-600', gradient: 'from-indigo-500 to-indigo-700', eta: 'Q4 2026',
    features: [
      'Lead scoring — who is most likely to close?',
      'Churn risk detection for existing contacts',
      'Revenue forecast for next 30/60/90 days',
      'Deal win probability by stage and rep',
      'Automated anomaly detection in your metrics',
    ],
  },
}

export default function AiHubPage() {
  const params = useParams()
  const slug   = Array.isArray(params.slug) ? params.slug[0] : params.slug
  const cfg    = PAGE_CONFIG[slug ?? '']

  if (!cfg) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <Sparkles size={32} className="text-violet-300 mx-auto mb-3"/>
        <p className="text-gray-500">Page not found</p>
        <Link href="/ai/copilot" className="mt-2 text-sm text-violet-600 hover:underline">Go to AI Copilot</Link>
      </div>
    </div>
  )

  const IC = cfg.icon

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shadow-lg shrink-0`}>
          <IC size={22} className="text-white"/>
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{cfg.title}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{cfg.subtitle}</p>
        </div>
        <span className="ml-auto bg-amber-100 text-amber-700 text-[11px] font-bold px-3 py-1 rounded-full border border-amber-200 shrink-0">
          Coming {cfg.eta}
        </span>
      </div>

      {/* Hero gradient card */}
      <div className={`bg-gradient-to-br ${cfg.gradient} rounded-2xl p-6 text-white`}>
        <Sparkles size={20} className="mb-3 text-white/80"/>
        <p className="text-white/90 leading-relaxed">
          {cfg.title} will be part of the AI Hub — a unified layer of artificial intelligence built into every corner of your CRM. It works alongside your data, not against it.
        </p>
      </div>

      {/* Planned features */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-4">What's planned</h2>
        <div className="space-y-3">
          {cfg.features.map(f => (
            <div key={f} className="flex items-start gap-3">
              <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0"/>
              <p className="text-sm text-gray-600">{f}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Use copilot now */}
      <div className="flex items-center gap-4 bg-violet-50 border border-violet-100 rounded-xl p-4">
        <Sparkles size={18} className="text-violet-500 shrink-0"/>
        <div className="flex-1">
          <p className="text-sm font-semibold text-violet-800">Use AI Copilot now</p>
          <p className="text-xs text-violet-600 mt-0.5">Ask questions about your CRM data in plain English while this module is in development.</p>
        </div>
        <Link href="/ai/copilot" className="flex items-center gap-1.5 text-sm text-violet-700 font-semibold hover:text-violet-900 shrink-0">
          Open Copilot <ArrowRight size={14}/>
        </Link>
      </div>
    </div>
  )
}
