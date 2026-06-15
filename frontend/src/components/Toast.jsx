const STYLES = {
  success: { bg: 'var(--success)', icon: '✓' },
  error:   { bg: 'var(--error)',   icon: '✕' },
  warning: { bg: 'var(--warn)',    icon: '⚠' },
  info:    { bg: 'var(--accent)',  icon: 'ℹ' },
}

export default function Toast({ toasts, onRemove }) {
  if (!toasts.length) return null
  return (
    <div style={{ position:'fixed', bottom:24, right:24, zIndex:9999, display:'flex', flexDirection:'column', gap:8, pointerEvents:'none' }}>
      {toasts.map(t => {
        const s = STYLES[t.type] || STYLES.success
        return (
          <div key={t.id}
            onClick={() => onRemove(t.id)}
            style={{
              display:'flex', alignItems:'center', gap:10,
              background:s.bg, color:'#fff',
              padding:'11px 16px', borderRadius:'var(--radius)',
              fontSize:13, fontWeight:700,
              boxShadow:'0 4px 16px rgba(0,0,0,0.18)',
              cursor:'pointer', pointerEvents:'all',
              maxWidth:360, wordBreak:'break-word',
              animation:'toast-in 0.2s ease',
            }}>
            <span style={{ fontSize:15, flexShrink:0 }}>{s.icon}</span>
            <span>{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}
