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
    if (!ctx)
        throw new Error('useSnackbar must be used within SnackbarProvider')
    return ctx
}

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
    const [snackbar, setSnackbar] = useState<SnackbarState>({
        open: false,
        message: '',
        type: 'success',
    })

    const showSnackbar = useCallback(
        (message: string, type: SnackbarType = 'success') => {
            setSnackbar({ open: true, message, type })
            setTimeout(() => {
                setSnackbar((prev) => ({ ...prev, open: false }))
            }, 2000)
        },
        [],
    )

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
                }`}>
                <span className="snackbar-icon">
                    {snackbar.type === 'success'
                        ? '✓'
                        : snackbar.type === 'error'
                          ? '✕'
                          : 'ℹ'}
                </span>
                <span>{snackbar.message}</span>
            </div>
        </SnackbarContext.Provider>
    )
}
