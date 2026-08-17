import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Screen } from '@/components/ui/Screen'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { useAuth } from '@/context/AuthContext'
import { useLinkedCustomer } from '@/hooks/useLinkedCustomer'
import { safeBack } from '@/lib/navigation'
import { supabase } from '@/lib/supabase'
import { colors, radius, spacing, typography } from '@/constants/theme'

type ThreadCategory = 'support' | 'cashin' | 'message'
type ThreadPriority = 'low' | 'normal' | 'high' | 'urgent'
type CashinStatus = 'pending' | 'received' | 'not_received'
type ThreadStatus = 'open' | 'closed'

type Thread = {
  id: string
  customer_name: string
  preview: string | null
  category: ThreadCategory
  priority: ThreadPriority
  status?: ThreadStatus | null
  updated_at: string
}

type Message = {
  id: string
  thread_id: string
  sender: 'staff' | 'customer'
  body: string | null
  image_url?: string | null
  kind?: 'message' | 'cashin'
  cashin_status?: CashinStatus | null
  created_at: string
}

const CATEGORY_LABEL: Record<ThreadCategory, string> = {
  support: 'Support',
  cashin: 'Cash-in',
  message: 'Message',
}

const PRIORITY_COLOR: Record<ThreadPriority, string> = {
  low: '#8a8a8a',
  normal: colors.gold,
  high: '#c47b2d',
  urgent: '#b42318',
}

function formatTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function SupportScreen() {
  const { user } = useAuth()
  const { customer } = useLinkedCustomer()
  const router = useRouter()
  const listRef = useRef<FlatList<Message>>(null)

  const [threads, setThreads] = useState<Thread[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [view, setView] = useState<'inbox' | 'thread'>('inbox')
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [modalMessage, setModalMessage] = useState('')

  function showModal(title: string, body: string) {
    setModalTitle(title)
    setModalMessage(body)
    setModalOpen(true)
  }

  const loadThreads = useCallback(async () => {
    if (!user?.id) {
      setThreads([])
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('chat_threads')
      .select('id, customer_name, preview, category, priority, status, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) {
      showModal(
        'Could not load chats',
        error.message.includes('user_id') || error.message.includes('category')
          ? `${error.message}\n\nAsk the clinic to run supabase/add_chat_conversation_tags.sql.`
          : error.message,
      )
      setLoading(false)
      return
    }

    setThreads((data as Thread[]) ?? [])
    setLoading(false)
  }, [user?.id])

  const loadMessages = useCallback(async (threadId: string) => {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })

    if (error) {
      showModal('Could not load messages', error.message)
      return
    }
    setMessages((data as Message[]) ?? [])
  }, [])

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  useEffect(() => {
    if (!activeId || view !== 'thread') {
      if (view === 'inbox') setMessages([])
      return
    }
    void loadMessages(activeId)
  }, [activeId, view, loadMessages])

  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel(`client-chat-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const row = (payload.new || payload.old) as Message | undefined
          if (!row?.thread_id) return
          if (view === 'thread' && row.thread_id === activeId) void loadMessages(activeId)
          void loadThreads()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_threads' },
        () => {
          void loadThreads()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id, activeId, view, loadMessages, loadThreads])

  useEffect(() => {
    if (view !== 'thread' || !messages.length) return
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80)
    return () => clearTimeout(t)
  }, [messages.length, activeId, view])

  function openThread(id: string) {
    setActiveId(id)
    setView('thread')
    setDraft('')
  }

  function backToInbox() {
    setView('inbox')
    setDraft('')
  }

  async function createSupportThread() {
    if (!user?.id) {
      showModal('Sign in required', 'Please sign in again.')
      return null
    }
    const name = customer?.full_name || user.name || 'Client'
    const { data, error } = await supabase
      .from('chat_threads')
      .insert({
        customer_name: name,
        preview: 'New conversation',
        unread: 0,
        user_id: user.id,
        customer_id: customer?.id ?? null,
        category: 'support',
        priority: 'normal',
        status: 'open',
      })
      .select('id')
      .single()

    if (error || !data) {
      showModal(
        'Could not start chat',
        error?.message.includes('status') ||
          error?.message.includes('user_id') ||
          error?.message.includes('category')
          ? `${error?.message || 'Try again.'}\n\nAsk the clinic to run supabase/add_chat_conversation_tags.sql and supabase/add_chat_thread_close.sql.`
          : error?.message || 'Try again.',
      )
      return null
    }
    await loadThreads()
    openThread(data.id)
    return data.id as string
  }

  async function send() {
    if (!draft.trim()) {
      showModal('Message required', 'Write a short message for the clinic.')
      return
    }
    if (!user?.id) {
      showModal('Sign in required', 'Please sign in again.')
      return
    }

    const active = threads.find((t) => t.id === activeId)
    if (active && (active.status || 'open') === 'closed') {
      showModal('Conversation closed', 'This chat was closed by the clinic. Start a new conversation to message again.')
      return
    }

    setSending(true)
    const body = draft.trim()
    let threadId = activeId
    if (!threadId || view !== 'thread') {
      threadId = await createSupportThread()
      if (!threadId) {
        setSending(false)
        return
      }
    }

    const { error: msgError } = await supabase.from('chat_messages').insert({
      thread_id: threadId,
      sender: 'customer',
      body,
      kind: 'message',
    })

    if (msgError) {
      setSending(false)
      const closedHint =
        msgError.message.toLowerCase().includes('row-level security') ||
        msgError.message.toLowerCase().includes('policy')
          ? `${msgError.message}\n\nIf this chat was closed, start a new conversation. Or ask the clinic to run supabase/add_chat_thread_close.sql / fix_client_chat_message_insert.sql.`
          : msgError.message
      showModal('Could not send', closedHint)
      return
    }

    await supabase
      .from('chat_threads')
      .update({
        preview: body.slice(0, 120),
        unread: 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId)

    setDraft('')
    setSending(false)
    setView('thread')
    setActiveId(threadId)
    await loadMessages(threadId)
    await loadThreads()
  }

  const active = threads.find((t) => t.id === activeId)
  const isClosed = (active?.status || 'open') === 'closed'

  return (
    <Screen style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {view === 'inbox' ? (
          <>
            <ScreenHeader
              eyebrow="Support"
              title="Chat with the clinic"
              subtitle="Scroll your conversations and open one to read replies."
            />

            {loading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={colors.gold} />
              </View>
            ) : (
              <>
                <View style={styles.inboxActions}>
                  <Button title="New conversation" onPress={() => void createSupportThread()} />
                  <Button title="Back" variant="ghost" onPress={() => safeBack(router)} />
                </View>

                {threads.length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>No conversations yet</Text>
                    <Text style={styles.emptyBody}>
                      Start a conversation to ask about appointments, packages, points, or wallet.
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={threads}
                    keyExtractor={(item) => item.id}
                    style={styles.flex}
                    contentContainerStyle={styles.inboxList}
                    showsVerticalScrollIndicator
                    renderItem={({ item }) => {
                      const closed = (item.status || 'open') === 'closed'
                      return (
                        <Pressable style={styles.inboxRow} onPress={() => openThread(item.id)}>
                          <View style={styles.inboxRowTop}>
                            <Text style={styles.inboxCat}>
                              {CATEGORY_LABEL[item.category] || 'Support'}
                            </Text>
                            <View style={styles.inboxRowBadges}>
                              {closed ? <Text style={styles.closedBadge}>Closed</Text> : null}
                              <View
                                style={[
                                  styles.priorityDot,
                                  {
                                    backgroundColor:
                                      PRIORITY_COLOR[item.priority] || colors.gold,
                                  },
                                ]}
                              />
                            </View>
                          </View>
                          <Text style={styles.inboxPreview} numberOfLines={2}>
                            {item.preview || 'Conversation'}
                          </Text>
                          <Text style={styles.inboxTime}>{formatTime(item.updated_at)}</Text>
                        </Pressable>
                      )
                    }}
                  />
                )}
              </>
            )}
          </>
        ) : (
          <>
            <View style={styles.threadHead}>
              <Pressable onPress={backToInbox} hitSlop={8}>
                <Text style={styles.backLink}>← All conversations</Text>
              </Pressable>
              <ScreenHeader
                eyebrow="Support"
                title={CATEGORY_LABEL[active?.category || 'support'] || 'Conversation'}
                subtitle={
                  isClosed
                    ? 'This conversation was closed by the clinic.'
                    : 'See replies from staff and continue here.'
                }
              />
              {active ? (
                <View style={styles.activeMeta}>
                  <Text
                    style={[
                      styles.activePriority,
                      { color: PRIORITY_COLOR[active.priority] || colors.gold },
                    ]}
                  >
                    {(active.priority || 'normal').toUpperCase()}
                  </Text>
                  {isClosed ? <Text style={styles.closedBadge}>Closed</Text> : null}
                </View>
              ) : null}
            </View>

            <View style={styles.conversation}>
              {messages.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No messages yet</Text>
                  <Text style={styles.emptyBody}>
                    Write below to start this conversation with the clinic.
                  </Text>
                </View>
              ) : (
                <FlatList
                  ref={listRef}
                  data={messages}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.messageList}
                  onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                  renderItem={({ item }) => {
                    const mine = item.sender === 'customer'
                    return (
                      <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
                        <View
                          style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
                        >
                          {item.body ? (
                            <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                              {item.body}
                            </Text>
                          ) : null}
                          {item.image_url ? (
                            <Image source={{ uri: item.image_url }} style={styles.receipt} />
                          ) : null}
                          {item.kind === 'cashin' && item.cashin_status ? (
                            <Text
                              style={[
                                styles.cashinTag,
                                item.cashin_status === 'received' && styles.cashinReceived,
                                item.cashin_status === 'not_received' && styles.cashinNotReceived,
                              ]}
                            >
                              {item.cashin_status === 'received'
                                ? 'Marked received'
                                : item.cashin_status === 'not_received'
                                  ? 'Marked not received'
                                  : 'Cash-in pending'}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.meta}>
                          {mine ? 'You' : 'Clinic'} · {formatTime(item.created_at)}
                        </Text>
                      </View>
                    )
                  }}
                />
              )}
            </View>

            {isClosed ? (
              <View style={styles.closedBanner}>
                <Text style={styles.closedBannerTitle}>Conversation closed</Text>
                <Text style={styles.closedBannerBody}>
                  You can still read this chat. Start a new conversation to message the clinic
                  again.
                </Text>
                <Button title="New conversation" onPress={() => void createSupportThread()} />
                <Button title="Back to list" variant="ghost" onPress={backToInbox} />
              </View>
            ) : (
              <View style={styles.composer}>
                <TextInput
                  style={styles.input}
                  multiline
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Write a reply…"
                  placeholderTextColor={colors.muted}
                />
                <View style={styles.actions}>
                  <Button
                    title={sending ? 'Sending…' : 'Send reply'}
                    onPress={() => void send()}
                    disabled={sending}
                  />
                  <Button title="All conversations" variant="ghost" onPress={backToInbox} />
                </View>
              </View>
            )}
          </>
        )}
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={modalOpen}
        eyebrow="Support"
        title={modalTitle}
        message={modalMessage}
        confirmLabel="OK"
        cancelLabel="Close"
        onConfirm={() => setModalOpen(false)}
        onCancel={() => setModalOpen(false)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  inboxActions: { gap: spacing.sm, marginBottom: spacing.md },
  inboxList: { gap: spacing.sm, paddingBottom: spacing.xl },
  inboxRow: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  inboxRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  inboxCat: {
    fontFamily: typography.bodyBold,
    fontSize: 12,
    color: colors.ink,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inboxRowBadges: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inboxPreview: {
    fontFamily: typography.body,
    fontSize: 15,
    color: colors.body,
    lineHeight: 21,
  },
  inboxTime: {
    marginTop: 8,
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.muted,
  },
  closedBadge: {
    fontFamily: typography.bodyBold,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.danger,
  },
  priorityDot: { width: 8, height: 8, borderRadius: 99 },
  threadHead: { marginBottom: spacing.sm },
  backLink: {
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    color: colors.gold,
    marginBottom: spacing.xs,
  },
  conversation: {
    flex: 1,
    minHeight: 220,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvasDeep,
    overflow: 'hidden',
  },
  activeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  activePriority: {
    fontFamily: typography.bodyBold,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  emptyTitle: {
    fontFamily: typography.bodyBold,
    fontSize: 16,
    color: colors.ink,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  messageList: {
    padding: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  row: { maxWidth: '88%', gap: 4 },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  bubbleMine: {
    backgroundColor: colors.black,
    borderBottomRightRadius: 6,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderBottomLeftRadius: 6,
  },
  bubbleText: {
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  bubbleTextMine: { color: colors.white },
  receipt: {
    marginTop: 8,
    width: 180,
    height: 140,
    borderRadius: 12,
  },
  cashinTag: {
    marginTop: 8,
    fontFamily: typography.bodyBold,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  cashinReceived: { color: colors.success },
  cashinNotReceived: { color: colors.danger },
  meta: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.muted,
  },
  composer: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  input: {
    minHeight: 88,
    maxHeight: 140,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: spacing.md,
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  actions: { gap: spacing.sm },
  closedBanner: {
    marginTop: spacing.md,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvasDeep,
  },
  closedBannerTitle: {
    fontFamily: typography.bodyBold,
    fontSize: 15,
    color: colors.ink,
  },
  closedBannerBody: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
})
