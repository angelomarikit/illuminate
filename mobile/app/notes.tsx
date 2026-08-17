import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Screen } from '@/components/ui/Screen'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { useLinkedCustomer } from '@/hooks/useLinkedCustomer'
import { safeBack } from '@/lib/navigation'
import { supabase } from '@/lib/supabase'
import { colors, spacing, typography } from '@/constants/theme'

type Note = {
  id: string
  service_name: string
  doctor_notes: string | null
  sold_on: string | null
}

type Comment = {
  id: string
  author_name: string
  body: string
  created_at: string
}

export default function NotesScreen() {
  const { customer } = useLinkedCustomer()
  const router = useRouter()
  const [notes, setNotes] = useState<Note[]>([])
  const [comments, setComments] = useState<Comment[]>([])

  useEffect(() => {
    async function load() {
      if (!customer?.id) {
        setNotes([])
        setComments([])
        return
      }
      const [pkgRes, commentRes] = await Promise.all([
        supabase
          .from('client_session_packages')
          .select('id, service_name, doctor_notes, sold_on')
          .eq('customer_id', customer.id)
          .not('doctor_notes', 'is', null)
          .order('sold_on', { ascending: false })
          .limit(20),
        supabase
          .from('client_care_comments')
          .select('id, author_name, body, created_at')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ])
      setNotes(((pkgRes.data as Note[]) ?? []).filter((n) => n.doctor_notes?.trim()))
      setComments((commentRes.data as Comment[]) ?? [])
    }
    load()
  }, [customer])

  return (
    <Screen scroll>
      <ScreenHeader
        eyebrow="Care notes"
        title="Doctor notes"
        subtitle="Advice from your clinicians after visits."
      />

      <Text style={styles.section}>Session notes</Text>
      {!notes.length ? (
        <Card>
          <Text style={styles.muted}>No doctor notes yet.</Text>
        </Card>
      ) : (
        notes.map((n) => (
          <Card key={n.id} style={styles.card}>
            <Text style={styles.title}>{n.service_name}</Text>
            <Text style={styles.muted}>{n.sold_on || '—'}</Text>
            <Text style={styles.body}>{n.doctor_notes}</Text>
          </Card>
        ))
      )}

      <Text style={styles.section}>Care comments</Text>
      {!comments.length ? (
        <Card>
          <Text style={styles.muted}>No care comments yet.</Text>
        </Card>
      ) : (
        comments.map((c) => (
          <Card key={c.id} style={styles.card}>
            <Text style={styles.title}>{c.author_name}</Text>
            <Text style={styles.muted}>{new Date(c.created_at).toLocaleString()}</Text>
            <Text style={styles.body}>{c.body}</Text>
          </Card>
        ))
      )}

      <View style={styles.actions}>
        <Button title="Close" variant="ghost" onPress={() => safeBack(router)} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    fontFamily: typography.bodyBold,
    fontSize: 18,
    color: colors.ink,
  },
  card: {
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: typography.bodyBold,
    fontSize: 16,
    color: colors.ink,
  },
  muted: {
    marginTop: 4,
    fontFamily: typography.body,
    color: colors.muted,
    fontSize: 13,
  },
  body: {
    marginTop: 10,
    fontFamily: typography.body,
    color: colors.body,
    lineHeight: 22,
    fontSize: 15,
  },
  actions: {
    marginTop: spacing.lg,
  },
})
