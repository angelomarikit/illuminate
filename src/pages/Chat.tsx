import { useCallback, useEffect, useState, type FormEvent } from 'react'
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

export function Chat() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

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

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!activeId || !draft.trim()) return
    const body = draft.trim()
    setDraft('')
    const { error: err } = await supabase.from('chat_messages').insert({
      thread_id: activeId,
      sender: 'staff',
      body,
    })
    if (err) {
      setError(err.message)
      return
    }
    await supabase
      .from('chat_threads')
      .update({ preview: body, updated_at: new Date().toISOString() })
      .eq('id', activeId)
    setMessage('Message sent.')
    await loadMessages(activeId)
    await loadThreads()
  }

  const active = threads.find((t) => t.id === activeId)

  return (
    <div>
      <PageHeader
        kicker="Support"
        title="Chat Support"
        subtitle="Staff inbox for client messages. Mobile app channel can plug into these threads later."
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}

      <div className="chat-layout panel">
        <aside className="chat-list">
          {threads.length === 0 ? (
            <div className="empty-state">No threads yet. Run setup.sql to seed sample chats.</div>
          ) : (
            threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className="chat-thread"
                onClick={() => setActiveId(thread.id)}
                style={{
                  background: thread.id === activeId ? 'var(--surface-muted)' : undefined,
                }}
              >
                <div className="avatar">{thread.customer_name.slice(0, 1)}</div>
                <div className="chat-thread-body">
                  <div className="chat-thread-top">
                    <strong>{thread.customer_name}</strong>
                    <span>{new Date(thread.updated_at).toLocaleDateString()}</span>
                  </div>
                  <p>{thread.preview}</p>
                </div>
                {thread.unread ? <span className="badge badge-neutral">{thread.unread}</span> : null}
              </button>
            ))
          )}
        </aside>
        <section className="chat-pane" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', padding: 0 }}>
          {active ? (
            <>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
                <strong>{active.customer_name}</strong>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'grid', gap: 10 }}>
                {messages.length === 0 ? (
                  <div className="empty-state">No messages yet. Send the first reply.</div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        justifySelf: m.sender === 'staff' ? 'end' : 'start',
                        maxWidth: '75%',
                        background: m.sender === 'staff' ? '#0a0a0a' : 'var(--surface-muted)',
                        color: m.sender === 'staff' ? '#fff' : 'inherit',
                        borderRadius: 12,
                        padding: '10px 12px',
                        fontSize: '0.9rem',
                      }}
                    >
                      {m.body}
                    </div>
                  ))
                )}
              </div>
              <form
                onSubmit={send}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: 16,
                  borderTop: '1px solid var(--line)',
                }}
              >
                <input
                  className="input"
                  placeholder="Type a reply..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button className="btn btn-primary" type="submit">
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="chat-pane-empty">
              <h2>Select a conversation</h2>
              <p>Choose a client thread on the left to reply.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
