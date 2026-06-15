import { useState, useCallback } from 'react'

let _nextId = 1

export function useToast() {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = _nextId++
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration)
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  return { toasts, showToast, removeToast }
}
