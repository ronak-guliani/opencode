const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

export function relative(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  if (diff < MINUTE) return "just now"
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE)
    return `${mins}m ago`
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR)
    return `${hours}h ago`
  }
  const days = Math.floor(diff / DAY)
  if (days === 1) return "yesterday"
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export function group(timestamp: number): string {
  const now = new Date()
  const date = new Date(timestamp)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diff = today.getTime() - target.getTime()

  if (diff < DAY) return "Today"
  if (diff < 2 * DAY) return "Yesterday"
  if (diff < 7 * DAY) return "This Week"
  if (diff < 30 * DAY) return "This Month"
  return "Older"
}

export function tokens(count: number): string {
  if (count < 1000) return `${count}`
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`
  return `${(count / 1_000_000).toFixed(1)}M`
}
