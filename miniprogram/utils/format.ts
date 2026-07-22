export function formatDate(iso: string | null): string {
    if (!iso) return '-'
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatNumber(n: number): string {
    return n.toLocaleString()
}

export function getCurrentMonth(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function formatPoints(n: number): string {
    const sign = n >= 0 ? '+' : '-'
    return `${sign}${Math.abs(n)}`
}
