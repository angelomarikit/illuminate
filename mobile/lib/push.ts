import { Platform } from 'react-native'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { supabase } from '@/lib/supabase'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export async function registerForPushNotificationsAsync(userId: string) {
  // Expo push token listeners / remote push are not fully supported on web.
  if (Platform.OS === 'web') return null

  if (!Device.isDevice) {
    // Simulators often cannot receive remote push; still allow local notifications.
    const { status } = await Notifications.requestPermissionsAsync()
    return status === 'granted' ? 'simulator' : null
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('illuminate-default', {
      name: 'Illuminate',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#b8954a',
    })
  }

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') return null

  const projectId =
    Constants.easConfig?.projectId ||
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId

  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  )
  const token = tokenResponse.data
  if (!token) return null

  await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      token,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,token' },
  )

  return token
}

export async function scheduleUpcomingLocalReminder(input: {
  id: string
  title: string
  body: string
  when: Date
}) {
  const triggerDate = input.when
  if (triggerDate.getTime() <= Date.now()) return null

  return Notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body,
      data: { href: '/(tabs)/appointments', appointmentId: input.id },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  })
}
