import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'
import type { NotificationKind } from '../../lib/notifications'

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
  const { enabled, items, loading, error, unreadCount, acknowledge, clearAll, reload } =
    useNotifications()

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
