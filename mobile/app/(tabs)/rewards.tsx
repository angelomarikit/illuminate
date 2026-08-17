import { useCallback, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Field } from '@/components/ui/Field'
import { Screen } from '@/components/ui/Screen'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { useAuth } from '@/context/AuthContext'
import { useLinkedCustomer } from '@/hooks/useLinkedCustomer'
import { supabase } from '@/lib/supabase'
import { colors, radius, spacing, typography } from '@/constants/theme'

type Txn = {
  id: string
  type: string
  points: number
  amount: number | null
  note: string | null
  created_at: string
}

type PackageRow = {
  id: string
  service_name: string
  sold_on: string | null
  status: string | null
  sessions_used: number | null
  total_sessions: number | null
}

type ReceiptAsset = {
  uri: string
  mimeType: string
  fileName: string
}

export default function RewardsScreen() {
  const { user } = useAuth()
  const { customer, loading, refresh } = useLinkedCustomer()
  const [txns, setTxns] = useState<Txn[]>([])
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [amount, setAmount] = useState('')
  const [cashNote, setCashNote] = useState('')
  const [receipt, setReceipt] = useState<ReceiptAsset | null>(null)
  const [sending, setSending] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [modalMessage, setModalMessage] = useState('')

  const load = useCallback(async () => {
    const linked = await refresh()
    if (!linked?.id) {
      setTxns([])
      setPackages([])
      return
    }
    const [txnRes, pkgRes] = await Promise.all([
      supabase
        .from('loyalty_transactions')
        .select('id, type, points, amount, note, created_at')
        .eq('customer_id', linked.id)
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('client_session_packages')
        .select('id, service_name, sold_on, status, sessions_used, total_sessions')
        .eq('customer_id', linked.id)
        .order('sold_on', { ascending: false })
        .limit(15),
    ])
    setTxns((txnRes.data as Txn[]) ?? [])
    setPackages((pkgRes.data as PackageRow[]) ?? [])
  }, [refresh])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  function showModal(title: string, message: string) {
    setModalTitle(title)
    setModalMessage(message)
    setModalOpen(true)
  }

  async function pickReceipt() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      showModal('Permission needed', 'Allow photo access to attach your receipt.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.75,
      allowsEditing: true,
    })
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]
    const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg'
    setReceipt({
      uri: asset.uri,
      mimeType: asset.mimeType || (ext === 'png' ? 'image/png' : 'image/jpeg'),
      fileName: asset.fileName || `receipt-${Date.now()}.${ext}`,
    })
  }

  async function uploadReceipt(userId: string, asset: ReceiptAsset) {
    const ext = asset.fileName.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${userId}/${Date.now()}.${ext}`
    const response = await fetch(asset.uri)
    const bytes = await response.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('chat-attachments')
      .upload(path, bytes, {
        contentType: asset.mimeType,
        upsert: false,
      })
    if (uploadError) throw uploadError
    const { data } = supabase.storage.from('chat-attachments').getPublicUrl(path)
    return data.publicUrl
  }

  async function requestCashIn() {
    const pesos = Number(amount)
    if (!Number.isFinite(pesos) || pesos <= 0) {
      showModal('Invalid amount', 'Enter a valid cash-in amount.')
      return
    }
    if (!user?.id) {
      showModal('Sign in required', 'Please sign in again to send a cash-in request.')
      return
    }

    setSending(true)
    try {
      let imageUrl: string | null = null
      if (receipt) {
        imageUrl = await uploadReceipt(user.id, receipt)
      }

      const customerName = customer?.full_name || user?.name || 'Client'
      const body = [
        `Cash-in request: ₱${pesos.toLocaleString()}`,
        cashNote.trim() ? `Note: ${cashNote.trim()}` : null,
        `Email: ${user?.email || customer?.email || '—'}`,
        `Phone: ${customer?.phone || '—'}`,
        imageUrl ? 'Receipt image attached.' : 'No receipt image attached.',
      ]
        .filter(Boolean)
        .join('\n')

      const { data: thread, error: threadError } = await supabase
        .from('chat_threads')
        .insert({
          customer_name: customerName,
          preview: `Cash-in ₱${pesos.toLocaleString()}${imageUrl ? ' · receipt' : ''}`.slice(0, 120),
          unread: 1,
          user_id: user.id,
          customer_id: customer?.id ?? null,
          category: 'cashin',
          priority: 'high',
          status: 'open',
        })
        .select('id')
        .single()

      if (threadError || !thread) {
        const hint =
          threadError?.message?.includes('category') ||
          threadError?.message?.includes('user_id') ||
          threadError?.message?.includes('schema cache')
            ? `${threadError?.message || 'Try again.'}\n\nAsk the clinic to run supabase/add_chat_conversation_tags.sql.`
            : threadError?.message || 'Try again later.'
        showModal('Could not send', hint)
        return
      }

      const { error: msgError } = await supabase.from('chat_messages').insert({
        thread_id: thread.id,
        sender: 'customer',
        body,
        image_url: imageUrl,
        kind: 'cashin',
        cashin_status: 'pending',
      })

      if (msgError) {
        const hint =
          msgError.message.includes('image_url') ||
          msgError.message.includes('cashin_status') ||
          msgError.message.includes('schema cache')
            ? `${msgError.message}\n\nAsk the clinic to run supabase/add_cashin_receipt_and_wallet_notify.sql and supabase/add_chat_conversation_tags.sql.`
            : msgError.message
        showModal('Could not send', hint)
        return
      }

      setAmount('')
      setCashNote('')
      setReceipt(null)
      showModal(
        'Request sent',
        imageUrl
          ? 'Your cash-in request and receipt were sent to Chat Support.'
          : 'Reception will confirm your cash-in at the clinic.',
      )
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message.includes('Bucket') || e.message.includes('chat-attachments')
            ? `${e.message}\n\nAsk the clinic to run supabase/add_cashin_receipt_and_wallet_notify.sql.`
            : e.message
          : 'Try again later.'
      showModal('Could not send', message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Screen scroll showHeader>
      <ScreenHeader
        eyebrow="Rewards"
        title="Points & wallet"
        subtitle="Request a cash-in with optional receipt photo — same support inbox as the clinic."
      />

      <View style={styles.stats}>
        <Card style={styles.stat}>
          <Text style={styles.label}>Points</Text>
          <Text style={styles.value}>{customer?.points ?? 0}</Text>
        </Card>
        <Card style={styles.stat}>
          <Text style={styles.label}>Wallet</Text>
          <Text style={styles.value}>
            ₱{Number(customer?.cash_in_balance ?? 0).toLocaleString()}
          </Text>
        </Card>
      </View>

      <Text style={styles.section}>Request cash-in</Text>
      <Card style={styles.cashCard}>
        <Field
          label="Amount (₱)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="1000"
        />
        <Field
          label="Note (optional)"
          value={cashNote}
          onChangeText={setCashNote}
          placeholder="GCash / bank transfer / etc."
        />

        <Text style={styles.attachLabel}>Receipt / transaction photo</Text>
        {receipt ? (
          <View style={styles.receiptPreview}>
            <Image source={{ uri: receipt.uri }} style={styles.receiptImage} />
            <View style={styles.receiptActions}>
              <Button title="Change photo" variant="ghost" onPress={() => void pickReceipt()} />
              <Button title="Remove" variant="ghost" onPress={() => setReceipt(null)} />
            </View>
          </View>
        ) : (
          <Pressable style={styles.attachBtn} onPress={() => void pickReceipt()}>
            <Text style={styles.attachTitle}>Attach receipt image</Text>
            <Text style={styles.muted}>Optional — shown in Chat Support for the clinic</Text>
          </Pressable>
        )}

        <Button
          title={sending ? 'Sending…' : 'Send cash-in request'}
          onPress={() => void requestCashIn()}
          disabled={sending}
        />
      </Card>

      <Text style={styles.section}>Session packages</Text>
      {loading ? <Text style={styles.muted}>Loading…</Text> : null}
      {!loading && !packages.length ? (
        <Card>
          <Text style={styles.muted}>No packages yet.</Text>
        </Card>
      ) : null}
      {packages.map((pkg) => (
        <Card key={pkg.id} style={styles.row}>
          <View style={styles.rowTop}>
            <Text style={styles.rowTitle}>{pkg.service_name}</Text>
            <Text style={styles.rowPoints}>{pkg.status || 'active'}</Text>
          </View>
          <Text style={styles.muted}>
            Sold {pkg.sold_on || '—'} · {pkg.sessions_used ?? 0}/{pkg.total_sessions ?? 0} sessions
          </Text>
        </Card>
      ))}

      <Text style={styles.section}>Recent activity</Text>
      {!loading && !txns.length ? (
        <Card>
          <Text style={styles.muted}>No loyalty activity yet.</Text>
        </Card>
      ) : null}

      {txns.map((txn) => (
        <Card key={txn.id} style={styles.row}>
          <View style={styles.rowTop}>
            <Text style={styles.rowTitle}>{txn.type}</Text>
            <Text style={styles.rowPoints}>
              {txn.points ? `${txn.points} pts` : ''}
              {txn.amount != null ? ` ₱${Number(txn.amount).toLocaleString()}` : ''}
            </Text>
          </View>
          <Text style={styles.muted}>{new Date(txn.created_at).toLocaleString()}</Text>
          {txn.note ? <Text style={styles.note}>{txn.note}</Text> : null}
        </Card>
      ))}

      <ConfirmModal
        visible={modalOpen}
        eyebrow="Rewards"
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
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  stat: {
    flex: 1,
  },
  label: {
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  value: {
    marginTop: 8,
    fontFamily: typography.display,
    fontSize: 28,
    color: colors.ink,
  },
  section: {
    fontFamily: typography.bodyBold,
    fontSize: 18,
    color: colors.ink,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  cashCard: {
    marginBottom: spacing.md,
  },
  attachLabel: {
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.gold,
    marginBottom: 8,
  },
  attachBtn: {
    borderWidth: 1,
    borderColor: colors.goldLine,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    backgroundColor: colors.goldMist,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 4,
  },
  attachTitle: {
    fontFamily: typography.bodyBold,
    fontSize: 15,
    color: colors.ink,
  },
  receiptPreview: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  receiptImage: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.canvasDeep,
  },
  receiptActions: {
    gap: spacing.sm,
  },
  row: {
    marginBottom: spacing.sm,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  rowTitle: {
    fontFamily: typography.bodyBold,
    color: colors.ink,
    textTransform: 'capitalize',
    flex: 1,
  },
  rowPoints: {
    fontFamily: typography.bodyMedium,
    color: colors.gold,
    textTransform: 'capitalize',
  },
  muted: {
    fontFamily: typography.body,
    color: colors.muted,
    fontSize: 13,
  },
  note: {
    marginTop: 6,
    fontFamily: typography.body,
    color: colors.body,
    fontSize: 14,
  },
})
