import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, MessageSquareText, Search, SendHorizontal } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { supabase } from '../lib/supabase'
import './chat.css'

type ThreadCategory = 'support' | 'cashin' | 'message'
type ThreadPriority = 'low' | 'normal' | 'high' | 'urgent'
type CashinStatus = 'pending' | 'received' | 'not_received'

type Thread = {
  id: string
  customer_name: string
  preview: string | null
  unread: number
  updated_at: string
  category?: ThreadCategory | null
  priority?: ThreadPriority | null
  status?: 'open' | 'closed' | null
  user_id?: string | null
}

type Message = {
  id: string
  thread_id: string
  sender: 'staff' | 'customer'
  body: string | null
  image_url?: string | null
  kind?: 'message' | 'cashin' | null
  cashin_status?: CashinStatus | null
  created_at: string
}

const CATEGORY_LABEL: Record<ThreadCategory, string> = {
  support: 'Support',
  cashin: 'Cash-in',
  message: 'Message',
}

const PRIORITY_LABEL: Record<ThreadPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
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

function isCashinMessage(message: Message) {
  return (
    message.kind === 'cashin' ||
    Boolean(message.cashin_status) ||
    Boolean(message.body?.toLowerCase().startsWith('cash-in request:'))
  )
}

export function Chat() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | ThreadCategory>('all')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [savingMeta, setSavingMeta] = useState(false)
  const [closing, setClosing] = useState(false)
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false)
  const messagesRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const shouldStickToBottom = useRef(true)

  const loadThreads = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('chat_threads')
      .select('*')
      .order('updated_at', { ascending: false })
    if (err) {
      setError(
        err.message.includes('category') || err.message.includes('priority')
          ? `${err.message} — run supabase/add_chat_conversation_tags.sql`
          : err.message,
      )
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

  function scrollMessagesToBottom() {
    const el = messagesRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  useEffect(() => {
    if (!activeId) return
    shouldStickToBottom.current = true
    void loadMessages(activeId)
  }, [activeId, loadMessages])

  useEffect(() => {
    if (!shouldStickToBottom.current) return
    // Keep scroll inside the pane only — never scrollIntoView (that jumps the page).
    const id = window.requestAnimationFrame(() => {
      scrollMessagesToBottom()
      shouldStickToBottom.current = false
    })
    return () => window.cancelAnimationFrame(id)
  }, [messages, activeId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return threads.filter((t) => {
      const category = (t.category || 'support') as ThreadCategory
      if (categoryFilter !== 'all' && category !== categoryFilter) return false
      if (!q) return true
      return (
        t.customer_name.toLowerCase().includes(q) ||
        (t.preview || '').toLowerCase().includes(q) ||
        CATEGORY_LABEL[category].toLowerCase().includes(q)
      )
    })
  }, [threads, query, categoryFilter])

  const unreadTotal = useMemo(
    () => threads.reduce((sum, t) => sum + (Number(t.unread) || 0), 0),
    [threads],
  )

  const active = threads.find((t) => t.id === activeId)
  const activeCategory = (active?.category || 'support') as ThreadCategory
  const activePriority = (active?.priority || 'normal') as ThreadPriority
  const activeClosed = (active?.status || 'open') === 'closed'

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

  async function updateThreadMeta(patch: Partial<Pick<Thread, 'category' | 'priority'>>) {
    if (!activeId || savingMeta) return
    setSavingMeta(true)
    setError('')
    const { error: err } = await supabase.from('chat_threads').update(patch).eq('id', activeId)
    setSavingMeta(false)
    if (err) {
      setError(
        err.message.includes('category') || err.message.includes('priority')
          ? `${err.message} — run supabase/add_chat_conversation_tags.sql`
          : err.message,
      )
      return
    }
    setThreads((prev) => prev.map((t) => (t.id === activeId ? { ...t, ...patch } : t)))
  }

  async function setThreadClosed(closed: boolean) {
    if (!activeId || closing) return
    setClosing(true)
    setError('')
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const patch = closed
      ? {
          status: 'closed' as const,
          closed_at: new Date().toISOString(),
          closed_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        }
      : {
          status: 'open' as const,
          closed_at: null,
          closed_by: null,
          updated_at: new Date().toISOString(),
        }
    const { error: err } = await supabase.from('chat_threads').update(patch).eq('id', activeId)
    setClosing(false)
    if (err) {
      setError(
        err.message.includes('status') || err.message.includes('schema cache')
          ? `${err.message} — run supabase/add_chat_thread_close.sql`
          : err.message,
      )
      return
    }
    setThreads((prev) => prev.map((t) => (t.id === activeId ? { ...t, ...patch } : t)))
  }

  async function setCashinStatus(messageId: string, status: CashinStatus) {
    setError('')
    const { error: err } = await supabase
      .from('chat_messages')
      .update({ cashin_status: status, kind: 'cashin' })
      .eq('id', messageId)
    if (err) {
      setError(
        err.message.includes('cashin_status')
          ? `${err.message} — run supabase/add_chat_conversation_tags.sql`
          : err.message,
      )
      return
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, cashin_status: status, kind: 'cashin' } : m,
      ),
    )
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
      kind: 'message',
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
    shouldStickToBottom.current = true
    await loadMessages(activeId)
    await loadThreads()
  }

  return (
    <div className="chat-page">
      <PageHeader
        kicker="Support"
        title="Chat Support"
        subtitle="Client conversations with category tags, priority, and cash-in receipt status."
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
            <div className="chat-filter-row" role="tablist" aria-label="Filter by type">
              {(['all', 'cashin', 'support', 'message'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={categoryFilter === key}
                  className={`chat-filter-chip ${categoryFilter === key ? 'is-active' : ''}`}
                  onClick={() => setCategoryFilter(key)}
                >
                  {key === 'all' ? 'All' : CATEGORY_LABEL[key]}
                </button>
              ))}
            </div>
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
                    ? 'Try another search or filter.'
                    : 'Client threads will appear here when they message support.'}
                </span>
              </div>
            ) : (
              filtered.map((thread) => {
                const category = (thread.category || 'support') as ThreadCategory
                const priority = (thread.priority || 'normal') as ThreadPriority
                const closed = (thread.status || 'open') === 'closed'
                return (
                  <button
                    key={thread.id}
                    type="button"
                    className={`chat-thread ${thread.id === activeId ? 'is-active' : ''} ${
                      closed ? 'is-closed' : ''
                    }`}
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
                      <div className="chat-thread-tags">
                        <span className={`chat-tag chat-tag-category is-${category}`}>
                          {CATEGORY_LABEL[category]}
                        </span>
                        <span className={`chat-tag chat-tag-priority is-${priority}`}>
                          {PRIORITY_LABEL[priority]}
                        </span>
                        {closed ? <span className="chat-tag chat-tag-closed">Closed</span> : null}
                      </div>
                      <p className="chat-thread-preview">{thread.preview || 'No messages yet'}</p>
                    </div>
                    {thread.unread ? <span className="chat-unread">{thread.unread}</span> : null}
                  </button>
                )
              })
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
                    <span>
                      {CATEGORY_LABEL[activeCategory]}
                      {activeClosed ? ' · Closed' : ' · Active'}
                    </span>
                  </div>
                </div>
                <div className="chat-pane-controls">
                  <div className="chat-meta-group" role="group" aria-label="Conversation type">
                    <span className="chat-meta-label">Type</span>
                    <div className="chat-seg">
                      {(['support', 'cashin', 'message'] as ThreadCategory[]).map((key) => (
                        <button
                          key={key}
                          type="button"
                          className={`chat-seg-btn is-type-${key} ${
                            activeCategory === key ? 'is-active' : ''
                          }`}
                          disabled={savingMeta}
                          onClick={() => void updateThreadMeta({ category: key })}
                        >
                          {CATEGORY_LABEL[key]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="chat-meta-group" role="group" aria-label="Priority">
                    <span className="chat-meta-label">Priority</span>
                    <div className="chat-seg chat-seg-priority">
                      {(['low', 'normal', 'high', 'urgent'] as ThreadPriority[]).map((key) => (
                        <button
                          key={key}
                          type="button"
                          className={`chat-seg-btn is-priority-${key} ${
                            activePriority === key ? 'is-active' : ''
                          }`}
                          disabled={savingMeta}
                          onClick={() => void updateThreadMeta({ priority: key })}
                        >
                          <i aria-hidden />
                          {PRIORITY_LABEL[key]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {activeClosed ? (
                    <button
                      type="button"
                      className="chat-close-btn is-reopen"
                      disabled={closing}
                      onClick={() => void setThreadClosed(false)}
                    >
                      {closing ? '…' : 'Reopen'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="chat-close-btn"
                      disabled={closing}
                      onClick={() => void setThreadClosed(true)}
                    >
                      {closing ? '…' : 'Close chat'}
                    </button>
                  )}
                </div>
              </div>

              {activeClosed ? (
                <div className="chat-closed-banner">
                  This conversation is closed. The client can read it but cannot send new messages.
                </div>
              ) : null}

              <div
                className="chat-messages"
                ref={messagesRef}
                onScroll={() => {
                  const el = messagesRef.current
                  if (!el) return
                  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
                  shouldStickToBottom.current = nearBottom
                }}
              >
                {timeline.length === 0 ? (
                  <div className="chat-messages-empty">
                    <strong>Start the conversation</strong>
                    <span>Send a thoughtful first reply — clients see this in the mobile app.</span>
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
                        <div className="chat-bubble">
                          {item.message.body ? (
                            <p className="chat-bubble-text">{item.message.body}</p>
                          ) : null}
                          {item.message.image_url ? (
                            <a
                              className="chat-bubble-image-link"
                              href={item.message.image_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <img
                                className="chat-bubble-image"
                                src={item.message.image_url}
                                alt="Attached receipt"
                              />
                              <span className="chat-bubble-image-caption">View receipt</span>
                            </a>
                          ) : null}
                        </div>
                        {isCashinMessage(item.message) ? (
                          <div className="chat-cashin-actions">
                            <span
                              className={`chat-cashin-status is-${item.message.cashin_status || 'pending'}`}
                            >
                              {(item.message.cashin_status || 'pending').replace('_', ' ')}
                            </span>
                            <div className="chat-cashin-btns">
                              <button
                                type="button"
                                className={`chat-cashin-btn is-received ${
                                  item.message.cashin_status === 'received' ? 'is-active' : ''
                                }`}
                                onClick={() => void setCashinStatus(item.message.id, 'received')}
                              >
                                Received
                              </button>
                              <button
                                type="button"
                                className={`chat-cashin-btn is-not-received ${
                                  item.message.cashin_status === 'not_received' ? 'is-active' : ''
                                }`}
                                onClick={() =>
                                  void setCashinStatus(item.message.id, 'not_received')
                                }
                              >
                                Not received
                              </button>
                            </div>
                          </div>
                        ) : null}
                        <span className="chat-bubble-meta">
                          {item.message.sender === 'staff' ? 'You' : active.customer_name} ·{' '}
                          {formatMessageTime(item.message.created_at)}
                        </span>
                      </div>
                    ),
                  )
                )}
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
