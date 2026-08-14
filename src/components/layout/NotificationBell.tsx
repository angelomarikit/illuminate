import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, MonitorSmartphone } from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'
import { browserNotificationsSupported } from '../../lib/browserNotifications'
import type { AppNotification, NotificationKind } from '../../lib/notifications'

const KIND_LABEL: Record<NotificationKind, string> = {
  appointment_soon: 'Schedule',
  booking_pending: 'Booking',
  leave_pending: 'HR',
  low_stock: 'Stock',
}

export function NotificationBell() {
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [browserBusy, setBrowserBusy] = useState(false)
  const [browserHint, setBrowserHint] = useState('')

  const {
    enabled,
    items,
    loading,
    error,
    unreadCount,
    acknowledge,
    clearAll,
    reload,
    browserPermission,
    browserEnabled,
    enableBrowserNotifications,
    disableBrowserNotifications,
  } = useNotifications({
    onBrowserOpen: (item: AppNotification) => {
      void acknowledge([item.key])
      navigate(item.href)
      setOpen(true)
    },
  })

  useEffect(() => {
    if (!open) return
    void reload()
    function onPointerDown(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, reload])

  if (!enabled) return null

  async function onOpenItem(key: string, href: string) {
    await acknowledge([key])
    setOpen(false)
    navigate(href)
  }

  async function onToggleBrowser() {
    setBrowserHint('')
    setBrowserBusy(true)
    try {
      if (browserEnabled) {
        disableBrowserNotifications()
        setBrowserHint('Desktop alerts paused on this device.')
        return
      }
      const permission = await enableBrowserNotifications()
      if (permission === 'granted') {
        setBrowserHint('Desktop alerts enabled. New inbox items will also appear here.')
      } else if (permission === 'denied') {
        setBrowserHint('Blocked by the browser. Allow notifications for this site in settings.')
      } else if (permission === 'unsupported') {
        setBrowserHint('This browser does not support desktop notifications.')
      } else {
        setBrowserHint('Permission was not granted.')
      }
    } finally {
      setBrowserBusy(false)
    }
  }

  const showBrowserControls = browserNotificationsSupported()

  return (
    <div className="notif-bell" ref={panelRef}>
      <button
        className={`btn-icon notif-bell-trigger ${unreadCount ? 'has-unread' : ''}`}
        aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="notif-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        ) : null}
      </button>

      {open ? (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-head">
            <div>
              <p className="notif-panel-kicker">Inbox</p>
              <strong className="notif-panel-title">Notifications</strong>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!items.length}
              onClick={() => void clearAll()}
            >
              Clear all
            </button>
          </div>

          {showBrowserControls ? (
            <div className="notif-browser-bar">
              <div className="notif-browser-copy">
                <MonitorSmartphone size={14} />
                <span>
                  {browserEnabled && browserPermission === 'granted'
                    ? 'Desktop alerts on'
                    : browserPermission === 'denied'
                      ? 'Desktop alerts blocked'
                      : 'Desktop alerts off'}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={browserBusy || browserPermission === 'denied'}
                onClick={() => void onToggleBrowser()}
              >
                {browserEnabled && browserPermission === 'granted' ? 'Turn off' : 'Enable'}
              </button>
            </div>
          ) : null}
          {browserHint ? <p className="notif-browser-hint">{browserHint}</p> : null}

          <div className="notif-panel-body">
            {loading && !items.length ? (
              <div className="notif-empty">Checking updates…</div>
            ) : error ? (
              <div className="notif-empty is-error">{error}</div>
            ) : items.length === 0 ? (
              <div className="notif-empty">You’re all caught up.</div>
            ) : (
              <ul className="notif-list">
                {items.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      className={`notif-item ${item.unread ? 'is-unread' : ''}`}
                      onClick={() => void onOpenItem(item.key, item.href)}
                    >
                      <span className="notif-item-row">
                        <span className="notif-kind">{KIND_LABEL[item.kind]}</span>
                        {item.unread ? <span className="notif-dot" aria-label="Unread" /> : null}
                      </span>
                      <strong>{item.title}</strong>
                      <span className="notif-body">{item.body}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
