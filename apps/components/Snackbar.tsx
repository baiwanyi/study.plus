import { createContext, useContext, useState, useCallback } from 'react'

type SnackbarType = 'success' | 'error' | 'info'

interface SnackbarState {
  open: boolean
  message: string
  type: SnackbarType
}

interface SnackbarContextValue {
  showSnackbar: (message: string, type?: SnackbarType) => void
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null)

export function useSnackbar() {
  const ctx = useContext(SnackbarContext)
  if (!ctx) throw new Error('useSnackbar must be used within SnackbarProvider')
  return ctx
}

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: '',
    type: 'success',
  })

  const showSnackbar = useCallback((message: string, type: SnackbarType = 'success') => {
    setSnackbar({ open: true, message, type })
    setTimeout(() => {
      setSnackbar(prev => ({ ...prev, open: false }))
    }, 2000)
  }, [])

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}
      <div
        className={`snackbar ${snackbar.open ? 'snackbar-show' : ''} ${
          snackbar.type === 'error'
            ? 'snackbar-error'
            : snackbar.type === 'info'
            ? 'snackbar-info'
            : 'snackbar-success'
        }`}
      >
        <span className="snackbar-icon">
          {snackbar.type === 'success' ? '✓' : snackbar.type === 'error' ? '✕' : 'ℹ'}
        </span>
        <span>{snackbar.message}</span>
      </div>
    </SnackbarContext.Provider>
  )
}

// ===== Confirm Modal =====
interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({ open, title, message, confirmLabel = '确认', danger = false, onConfirm, onCancel }: ConfirmModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
          <p className="text-sm text-gray-600">{message}</p>
          <div className="flex justify-end gap-3 mt-5">
            <button onClick={onCancel} className="btn-outline">取消</button>
            <button onClick={onConfirm} className={danger ? 'btn-danger' : 'btn-primary'}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
