import type { AppNotification } from './notifications'

const PREF_KEY = 'illuminate.browserNotify.enabled'
const SHOWN_KEY = 'illuminate.browserNotify.shown'

export function browserNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getBrowserNotifyEnabled(): boolean {
  if (!browserNotificationsSupported()) return false
  try {
    return localStorage.getItem(PREF_KEY) === '1'
  } catch {
    return false
  }
}

export function setBrowserNotifyEnabled(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function getBrowserNotifyPermission(): NotificationPermission | 'unsupported' {
  if (!browserNotificationsSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestBrowserNotifyPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!browserNotificationsSupported()) return 'unsupported'
  if (Notification.permission === 'granted') {
    setBrowserNotifyEnabled(true)
    return 'granted'
  }
  if (Notification.permission === 'denied') return 'denied'
  const result = await Notification.requestPermission()
  if (result === 'granted') setBrowserNotifyEnabled(true)
  return result
}

function readShownKeys(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SHOWN_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as string[]
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function writeShownKeys(keys: Set<string>) {
  try {
    sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...keys].slice(-200)))
  } catch {
    /* ignore */
  }
}

export function markBrowserNoticesSeen(keys: string[]) {
  const shown = readShownKeys()
  for (const key of keys) shown.add(key)
  writeShownKeys(shown)
}

/** Show OS/browser notifications for newly appeared unread notices (same inbox items). */
export function pushBrowserNotifications(
  items: AppNotification[],
  opts?: { onOpen?: (item: AppNotification) => void },
) {
  if (!browserNotificationsSupported()) return
  if (Notification.permission !== 'granted') return
  if (!getBrowserNotifyEnabled()) return

  const unread = items.filter((n) => n.unread)
  const shown = readShownKeys()
  const fresh = unread.filter((n) => !shown.has(n.key))
  if (!fresh.length) return

  for (const item of fresh) {
    shown.add(item.key)
    try {
      const note = new Notification(item.title, {
        body: item.body,
        tag: item.key,
        renotify: false,
        silent: false,
      })
      note.onclick = () => {
        window.focus()
        opts?.onOpen?.(item)
        note.close()
      }
    } catch {
      /* some browsers block Notification construction */
    }
  }
  writeShownKeys(shown)
}
