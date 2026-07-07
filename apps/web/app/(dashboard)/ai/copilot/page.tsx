'use client'

import { useState, useRef, useEffect } from 'react'
import { api } from '@/lib/api'
import { Sparkles, Send, User, RotateCcw, ChevronRight } from 'lucide-react'

interface Message { role: 'user' | 'assistant'; content: string; ts: string }

const SUGGESTIONS = [
  'Show me all deals over $5,000 in negotiation stage',
  'How many contacts were added this month?',
  'Which invoices are overdue?',
  'Summarize open support tickets',
  'What are the top lead sources?',
  'Show projects due this week',
]

export default function AiCopilotPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send(text?: string) {
    const q = (text ?? input).trim()
    if (!q || loading) return
    setInput('')
    const userMsg: Message = { role: 'user', content: q, ts: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    try {
      const r = await api.post('/ai/search', { query: q })
      setMessages(prev => [...prev, {
        role: 'assistant', content: r.data.answer ?? 'No results found.',
        ts: new Date().toISOString(),
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ AI search is unavailable. Make sure `OPENAI_API_KEY` is set in your API `.env` file.',
        ts: new Date().toISOString(),
      }])
    } finally { setLoading(false) }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-52px)]">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-sm">
            <Sparkles size={16} className="text-white"/>
          </div>
          <div>
            <h1 className="font-bold text-gray-900">AI Copilot</h1>
            <p className="text-xs text-gray-400">Ask anything about your CRM data in natural language</p>
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto">
            {/* Welcome */}
            <div className="text-center mb-8 mt-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Sparkles size={24} className="text-white"/>
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">How can I help you today?</h2>
              <p className="text-sm text-gray-400">Ask me anything about your contacts, deals, invoices, tickets, or leads</p>
            </div>

            {/* Suggestions */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Try asking…</p>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-xl text-left text-sm text-gray-700 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 transition-all group shadow-sm">
                  <Sparkles size={13} className="text-violet-400 shrink-0"/>
                  <span className="flex-1">{s}</span>
                  <ChevronRight size={13} className="text-gray-300 group-hover:text-violet-400 transition-colors shrink-0"/>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles size={13} className="text-violet-600"/>
                  </div>
                )}
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-violet-600 text-white rounded-br-sm'
                    : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm'
                }`}>
                  {m.content}
                </div>
                {m.role === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                    <User size={13} className="text-gray-500"/>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles size={13} className="text-violet-600"/>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center h-4">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i*150}ms`}}/>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="px-6 pb-5 pt-3 border-t border-gray-100 shrink-0">
        <div className="max-w-2xl mx-auto">
          {messages.length > 0 && (
            <button onClick={() => setMessages([])}
              className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600 mb-2 transition-colors">
              <RotateCcw size={11}/> New conversation
            </button>
          )}
          <div className="flex items-end gap-2 bg-white border border-gray-200 rounded-2xl shadow-sm focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 transition-all px-3 py-2.5">
            <Sparkles size={13} className="text-violet-400 mb-0.5 shrink-0"/>
            <textarea
              ref={inputRef}
              rows={1}
              value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
              placeholder="Ask about your data… (Enter to send, Shift+Enter for new line)"
              className="flex-1 text-sm outline-none resize-none bg-transparent text-gray-800 placeholder:text-gray-400 max-h-32"
              style={{ height: 'auto' }}
              onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height='auto'; t.style.height=t.scrollHeight+'px' }}
            />
            <button onClick={() => send()}
              disabled={!input.trim() || loading}
              className="w-7 h-7 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-gray-100 flex items-center justify-center transition-colors shrink-0">
              <Send size={12} className={input.trim() && !loading ? 'text-white' : 'text-gray-400'}/>
            </button>
          </div>
          <p className="text-[10px] text-gray-400 text-center mt-2">AI answers are based on your CRM data via OpenAI. Requires OPENAI_API_KEY.</p>
        </div>
      </div>
    </div>
  )
}
