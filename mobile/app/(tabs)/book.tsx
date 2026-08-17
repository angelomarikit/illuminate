import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Field } from '@/components/ui/Field'
import { Screen } from '@/components/ui/Screen'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { useAuth } from '@/context/AuthContext'
import { useLinkedCustomer } from '@/hooks/useLinkedCustomer'
import { startOfMonth, toLocalDateKey } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import { colors, radius, spacing, typography } from '@/constants/theme'

const TIME_SLOTS = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
]

type Service = { id: string; name: string; duration_min: number }

export default function BookScreen() {
  const { user } = useAuth()
  const { customer, refresh } = useLinkedCustomer()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [booked, setBooked] = useState<Set<string>>(new Set())
  const [services, setServices] = useState<Service[]>([])
  const [serviceName, setServiceName] = useState('')
  const [customService, setCustomService] = useState('')
  const [note, setNote] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorOpen, setErrorOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successOpen, setSuccessOpen] = useState(false)
  const todayKey = toLocalDateKey(new Date())

  const daysInMonth = useMemo(() => {
    const first = startOfMonth(month)
    const pad = first.getDay()
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    const cells: Array<{ key: string; day: number | null }> = []
    for (let i = 0; i < pad; i += 1) cells.push({ key: `p-${i}`, day: null })
    for (let d = 1; d <= count; d += 1) {
      const date = new Date(month.getFullYear(), month.getMonth(), d)
      cells.push({ key: toLocalDateKey(date), day: d })
    }
    return cells
  }, [month])

  useEffect(() => {
    setPhone(customer?.phone || '')
  }, [customer?.phone])

  useEffect(() => {
    supabase
      .from('services')
      .select('id, name, duration_min')
      .eq('active', true)
      .order('name')
      .then(({ data }) => setServices((data as Service[]) ?? []))
  }, [])

  const loadSlots = useCallback(async () => {
    const from = toLocalDateKey(startOfMonth(month))
    const to = toLocalDateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0))
    const { data } = await supabase.rpc('list_booked_slots', {
      from_date: from,
      to_date: to,
    })
    const next = new Set<string>()
    ;(data as { appointment_date: string; appointment_time: string }[] | null)?.forEach((row) => {
      next.add(`${row.appointment_date}|${String(row.appointment_time).slice(0, 5)}`)
    })
    setBooked(next)
  }, [month])

  useEffect(() => {
    void loadSlots()
  }, [loadSlots])

  useFocusEffect(
    useCallback(() => {
      void loadSlots()
    }, [loadSlots]),
  )

  const available = TIME_SLOTS.filter((slot) => {
    if (!selectedDate) return true
    return !booked.has(`${selectedDate}|${slot}`)
  })

  function showError(message: string) {
    setErrorMessage(message)
    setErrorOpen(true)
  }

  async function submit() {
    if (!selectedDate || !selectedTime) {
      showError('Select a date and time first.')
      return
    }
    if (!user?.email) {
      showError('Your account is missing an email. Sign out and sign in again.')
      return
    }
    if (!phone.trim()) {
      showError('Add a phone number so we can confirm your visit.')
      return
    }

    const serviceLabel = customService.trim() || serviceName.trim() || 'Consultation'
    const duration = services.find((s) => s.name === serviceName)?.duration_min || 60

    setSaving(true)
    const { error } = await supabase.rpc('submit_client_portal_booking', {
      p_phone: phone.trim(),
      p_service_name: serviceLabel,
      p_special_note: note.trim() || null,
      p_appointment_date: selectedDate,
      p_appointment_time: selectedTime,
      p_duration_min: duration,
      p_source: 'mobile',
    })
    setSaving(false)

    if (error) {
      const hint =
        error.message.includes('submit_client_portal_booking') ||
        error.message.includes('schema cache') ||
        error.message.includes('Could not find the function')
          ? `${error.message}\n\nAsk the clinic to run supabase/fix_authenticated_client_booking.sql in Supabase.`
          : error.message
      showError(hint)
      return
    }

    setBooked((prev) => new Set(prev).add(`${selectedDate}|${selectedTime}`))
    setSelectedDate('')
    setSelectedTime('')
    setCustomService('')
    setNote('')
    await refresh()
    setSuccessOpen(true)
  }

  return (
    <Screen scroll showHeader>
      <ScreenHeader
        eyebrow="Book"
        title="Reserve a visit"
        subtitle="Pick a date and time. Your request goes to the same clinic queue as the website."
      />

      <Card style={styles.calCard}>
        <View style={styles.calHead}>
          <Pressable
            onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            <Text style={styles.nav}>‹</Text>
          </Pressable>
          <Text style={styles.month}>
            {month.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
          </Text>
          <Pressable
            onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            <Text style={styles.nav}>›</Text>
          </Pressable>
        </View>

        <View style={styles.week}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <Text key={`${d}-${i}`} style={styles.weekDay}>
              {d}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {daysInMonth.map((cell) => {
            if (cell.day == null) return <View key={cell.key} style={styles.dayEmpty} />
            const disabled = cell.key < todayKey
            const selected = selectedDate === cell.key
            return (
              <Pressable
                key={cell.key}
                disabled={disabled}
                onPress={() => {
                  setSelectedDate(cell.key)
                  setSelectedTime('')
                }}
                style={[
                  styles.day,
                  selected && styles.daySelected,
                  disabled && styles.dayDisabled,
                ]}
              >
                <Text style={[styles.dayText, selected && styles.dayTextSelected]}>
                  {cell.day}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </Card>

      <Text style={styles.label}>Available hours</Text>
      <View style={styles.times}>
        {(selectedDate ? available : TIME_SLOTS).map((slot) => {
          const taken = selectedDate ? booked.has(`${selectedDate}|${slot}`) : false
          const selected = selectedTime === slot
          return (
            <Pressable
              key={slot}
              disabled={!selectedDate || taken}
              onPress={() => setSelectedTime(slot)}
              style={[
                styles.time,
                selected && styles.timeSelected,
                (!selectedDate || taken) && styles.timeDisabled,
              ]}
            >
              <Text style={[styles.timeText, selected && styles.timeTextSelected]}>{slot}</Text>
            </Pressable>
          )
        })}
      </View>

      <Field
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="09xxxxxxxxx"
      />
      <Text style={styles.hint}>Clinic services</Text>
      <View style={styles.chips}>
        {services.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => {
              setServiceName(s.name)
              setCustomService('')
            }}
            style={[styles.chip, serviceName === s.name && styles.chipActive]}
          >
            <Text style={[styles.chipText, serviceName === s.name && styles.chipTextActive]}>
              {s.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Field
        label="Custom service"
        value={customService}
        onChangeText={(v) => {
          setCustomService(v)
          if (v.trim()) setServiceName('')
        }}
        placeholder="Or type a custom service"
      />
      <Field
        label="Special note"
        value={note}
        onChangeText={setNote}
        placeholder="Goals or preferences"
        multiline
        style={{ minHeight: 90, textAlignVertical: 'top' }}
      />

      <Button
        title={saving ? 'Submitting…' : 'Submit request'}
        onPress={() => void submit()}
        disabled={saving}
      />

      <ConfirmModal
        visible={successOpen}
        eyebrow="Booking"
        title="Request submitted"
        message="We received your visit request. Track it under Visits — reception will confirm."
        confirmLabel="Done"
        cancelLabel="Close"
        onConfirm={() => setSuccessOpen(false)}
        onCancel={() => setSuccessOpen(false)}
      />
      <ConfirmModal
        visible={errorOpen}
        eyebrow="Booking"
        title="Couldn’t submit"
        message={errorMessage}
        confirmLabel="OK"
        cancelLabel="Close"
        onConfirm={() => setErrorOpen(false)}
        onCancel={() => setErrorOpen(false)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  calCard: {
    marginBottom: spacing.lg,
  },
  calHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  month: {
    fontFamily: typography.bodyBold,
    fontSize: 16,
    color: colors.ink,
  },
  nav: {
    fontSize: 28,
    color: colors.gold,
    paddingHorizontal: 8,
  },
  week: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontFamily: typography.bodyMedium,
    fontSize: 11,
    color: colors.muted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayEmpty: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
  },
  day: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  daySelected: {
    backgroundColor: colors.gold,
  },
  dayDisabled: {
    opacity: 0.28,
  },
  dayText: {
    fontFamily: typography.bodyMedium,
    color: colors.ink,
  },
  dayTextSelected: {
    color: '#fff',
  },
  label: {
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.gold,
    marginBottom: 8,
  },
  times: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.lg,
  },
  time: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  timeSelected: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  timeDisabled: {
    opacity: 0.35,
  },
  timeText: {
    fontFamily: typography.bodyMedium,
    color: colors.ink,
  },
  timeTextSelected: {
    color: '#fff',
  },
  hint: {
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.gold,
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.canvasDeep,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipActive: {
    backgroundColor: colors.goldMist,
    borderColor: colors.goldLine,
  },
  chipText: {
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    color: colors.body,
  },
  chipTextActive: {
    color: colors.ink,
  },
})
