type StatusMessageProps = {
  type?: 'error' | 'success' | 'info'
  children: string
}

export function StatusMessage({ type = 'info', children }: StatusMessageProps) {
  if (!children) return null
  const color =
    type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--muted)'
  const bg =
    type === 'error' ? '#fdeceb' : type === 'success' ? '#eaf7ef' : 'var(--surface-soft)'

  return (
    <div
      className="panel"
      style={{ marginBottom: 16, borderColor: 'transparent', background: bg }}
    >
      <div className="panel-body" style={{ color, padding: '12px 16px' }}>
        {children}
      </div>
    </div>
  )
}
