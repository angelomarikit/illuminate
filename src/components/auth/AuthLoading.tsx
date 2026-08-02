export function AuthLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#fff',
        color: '#6b6b6b',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 600, color: '#0a0a0a', marginBottom: 8 }}>Illuminate</div>
        <div style={{ fontSize: '0.9rem' }}>Checking your session...</div>
      </div>
    </div>
  )
}
