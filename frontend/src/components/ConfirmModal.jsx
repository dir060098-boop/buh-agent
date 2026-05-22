/**
 * Красивый диалог подтверждения — замена window.confirm().
 *
 * Использование:
 *   const [confirmState, setConfirmState] = useState(null)
 *
 *   // Показать:
 *   setConfirmState({ title: 'Удалить?', message: 'Текст...', onConfirm: () => doDelete() })
 *
 *   // В JSX:
 *   <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
 */
export default function ConfirmModal({ state, onClose }) {
  if (!state) return null

  const { title, message, onConfirm, confirmLabel = 'Удалить', danger = true } = state

  function handleConfirm() {
    onClose()
    onConfirm()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn 0.12s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          width: '100%', maxWidth: 400,
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
      >
        {/* Шапка */}
        <div style={{
          padding: '16px 20px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{
            fontSize: 20,
            background: danger ? '#fff1f1' : 'var(--surface2)',
            borderRadius: '50%', width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {danger ? '🗑' : 'ℹ️'}
          </span>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{title}</div>
        </div>

        {/* Тело */}
        <div style={{ padding: '14px 20px 18px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
          {message}
        </div>

        {/* Кнопки */}
        <div style={{
          padding: '0 20px 16px',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '8px 18px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', color: 'var(--text2)',
            }}
          >
            Отмена
          </button>
          <button
            onClick={handleConfirm}
            style={{
              background: danger ? 'var(--error)' : 'var(--accent)',
              border: 'none',
              borderRadius: 'var(--radius-sm)', padding: '8px 18px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', color: '#fff',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
