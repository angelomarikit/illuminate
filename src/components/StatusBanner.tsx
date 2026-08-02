type StatusBannerProps = {
  error?: string
  success?: string
}

export function StatusBanner({ error, success }: StatusBannerProps) {
  if (!error && !success) return null

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div
        className="panel-body"
        style={{ color: error ? 'var(--danger)' : 'var(--success)', fontWeight: 500 }}
      >
        {error || success}
      </div>
    </div>
  )
}
