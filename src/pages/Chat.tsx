import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, MessageSquareText, Search, SendHorizontal } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { supabase } from '../lib/supabase'
import './chat.css'

type Thread = {
  id: string
  customer_name: string
  preview: string | null
  unread: number
  updated_at: string
}

type Message = {
  id: string
  thread_id: string
  sender: 'staff' | 'customer'
  body: string
  created_at: string
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function formatThreadTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  if (isYesterday) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatMessageTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function dayKey(iso: string) {
  return String(iso).slice(0, 10)
}

function formatDayLabel(iso: string) {
  const d = new Date(`${dayKey(iso)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dayKey(iso)
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  const key = dayKey(iso)
  if (key === today) return 'Today'
  if (key === y.toISOString().slice(0, 10)) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

export function Chat() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const loadThreads = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('chat_threads')
      .select('*')
      .order('updated_at', { ascending: false })
    if (err) {
      setError(err.message)
      return
    }
    setThreads((data as Thread[]) ?? [])
    setActiveId((id) => id || data?.[0]?.id || null)
  }, [])

  const loadMessages = useCallback(async (threadId: string) => {
    const { data, error: err } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at')
    if (err) {
      setError(err.message)
      return
    }
    setMessages((data as Message[]) ?? [])
    await supabase.from('chat_threads').update({ unread: 0 }).eq('id', threadId)
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)))
  }, [])

  useEffect(() => {
    loadThreads()
  }, [loadThreads])

  useEffect(() => {
    if (activeId) loadMessages(activeId)
  }, [activeId, loadMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return threads
    return threads.filter(
      (t) =>
        t.customer_name.toLowerCase().includes(q) ||
        (t.preview || '').toLowerCase().includes(q),
    )
  }, [threads, query])

  const unreadTotal = useMemo(
    () => threads.reduce((sum, t) => sum + (Number(t.unread) || 0), 0),
    [threads],
  )

  const active = threads.find((t) => t.id === activeId)

  const timeline = useMemo(() => {
    const items: Array<
      | { type: 'day'; key: string; label: string }
      | { type: 'msg'; key: string; message: Message }
    > = []
    let lastDay = ''
    for (const m of messages) {
      const day = dayKey(m.created_at)
      if (day !== lastDay) {
        items.push({ type: 'day', key: `day-${day}`, label: formatDayLabel(m.created_at) })
        lastDay = day
      }
      items.push({ type: 'msg', key: m.id, message: m })
    }
    return items
  }, [messages])

  function selectThread(id: string) {
    setActiveId(id)
    setMobileThreadOpen(true)
    setError('')
  }

  function resizeComposer() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!activeId || !draft.trim() || sending) return
    const body = draft.trim()
    setDraft('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setSending(true)
    setError('')
    const { error: err } = await supabase.from('chat_messages').insert({
      thread_id: activeId,
      sender: 'staff',
      body,
    })
    if (err) {
      setSending(false)
      setDraft(body)
      setError(err.message)
      return
    }
    await supabase
      .from('chat_threads')
      .update({ preview: body, updated_at: new Date().toISOString() })
      .eq('id', activeId)
    setSending(false)
    await loadMessages(activeId)
    await loadThreads()
  }

  return (
    <div className="chat-page">
      <PageHeader
        kicker="Support"
        title="Chat Support"
        subtitle="A calm staff inbox for client conversations — ready for the mobile app channel."
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <div className={`chat-shell ${mobileThreadOpen && active ? 'show-thread' : ''}`}>
        <aside className="chat-inbox">
          <div className="chat-inbox-head">
            <p className="chat-inbox-kicker">Inbox</p>
            <h2 className="chat-inbox-title">Conversations</h2>
            <label className="chat-search">
              <Search size={15} strokeWidth={2} aria-hidden />
              <input
                type="search"
                placeholder="Search clients or messages"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="chat-inbox-meta">
              <span>
                <strong>{filtered.length}</strong> thread{filtered.length === 1 ? '' : 's'}
              </span>
              <span>
                {unreadTotal > 0 ? (
                  <>
                    <strong>{unreadTotal}</strong> unread
                  </>
                ) : (
                  'All caught up'
                )}
              </span>
            </div>
          </div>

          <div className="chat-thread-scroll">
            {filtered.length === 0 ? (
              <div className="chat-inbox-empty">
                <strong>{threads.length ? 'No matches' : 'No conversations yet'}</strong>
                <span>
                  {threads.length
                    ? 'Try another search.'
                    : 'Client threads will appear here when they message support.'}
                </span>
              </div>
            ) : (
              filtered.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className={`chat-thread ${thread.id === activeId ? 'is-active' : ''}`}
                  onClick={() => selectThread(thread.id)}
                >
                  <div className="chat-avatar" aria-hidden>
                    {initials(thread.customer_name)}
                  </div>
                  <div className="chat-thread-main">
                    <div className="chat-thread-top">
                      <span className="chat-thread-name">{thread.customer_name}</span>
                      <span className="chat-thread-time">{formatThreadTime(thread.updated_at)}</span>
                    </div>
                    <p className="chat-thread-preview">{thread.preview || 'No messages yet'}</p>
                  </div>
                  {thread.unread ? <span className="chat-unread">{thread.unread}</span> : null}
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="chat-pane">
          {active ? (
            <>
              <div className="chat-pane-head">
                <div className="chat-pane-person">
                  <button
                    type="button"
                    className="chat-mobile-back"
                    onClick={() => setMobileThreadOpen(false)}
                  >
                    <ArrowLeft size={14} />
                    Inbox
                  </button>
                  <div className="chat-avatar" aria-hidden>
                    {initials(active.customer_name)}
                  </div>
                  <div className="chat-pane-copy">
                    <strong>{active.customer_name}</strong>
                    <span>Client support thread</span>
                  </div>
                </div>
                <span className="chat-pane-status">
                  <i aria-hidden />
                  Active
                </span>
              </div>

              <div className="chat-messages">
                {timeline.length === 0 ? (
                  <div className="chat-messages-empty">
                    <strong>Start the conversation</strong>
                    <span>Send a thoughtful first reply — clients see this in their portal.</span>
                  </div>
                ) : (
                  timeline.map((item) =>
                    item.type === 'day' ? (
                      <div key={item.key} className="chat-day-sep">
                        {item.label}
                      </div>
                    ) : (
                      <div
                        key={item.key}
                        className={`chat-bubble-row ${
                          item.message.sender === 'staff' ? 'is-staff' : 'is-client'
                        }`}
                      >
                        <div className="chat-bubble">{item.message.body}</div>
                        <span className="chat-bubble-meta">
                          {item.message.sender === 'staff' ? 'You' : active.customer_name} ·{' '}
                          {formatMessageTime(item.message.created_at)}
                        </span>
                      </div>
                    ),
                  )
                )}
                <div ref={bottomRef} />
              </div>

              <form className="chat-composer" onSubmit={send}>
                <label className="chat-composer-field">
                  <span className="sr-only">Reply</span>
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    placeholder="Write a reply…"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value)
                      resizeComposer()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void send(e as unknown as FormEvent)
                      }
                    }}
                  />
                </label>
                <button
                  className="chat-send"
                  type="submit"
                  disabled={sending || !draft.trim()}
                  aria-label="Send message"
                >
                  <SendHorizontal size={18} />
                </button>
              </form>
            </>
          ) : (
            <div className="chat-pane-empty">
              <div className="chat-pane-empty-card">
                <div className="chat-pane-empty-icon" aria-hidden>
                  <MessageSquareText size={24} />
                </div>
                <h2>Select a conversation</h2>
                <p>Choose a client on the left to read their messages and reply from the clinic.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
