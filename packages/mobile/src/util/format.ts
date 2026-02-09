const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

/**
 * Group label for a timestamp relative to now.
 * Returns "Today", "Yesterday", "This Week", "This Month", or a month/year string.
 */
export function relativeGroup(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  if (diff < DAY) {
    const today = new Date()
    const date = new Date(timestamp)
    if (today.getDate() === date.getDate()) return "Today"
    return "Yesterday"
  }

  if (diff < 2 * DAY) return "Yesterday"
  if (diff < 7 * DAY) return "This Week"
  if (diff < 30 * DAY) return "This Month"

  const date = new Date(timestamp)
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

/**
 * Format a relative time like "2m ago", "1h ago", "3d ago".
 */
export function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < MINUTE) return "now"
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  return `${Math.floor(diff / DAY)}d ago`
}

/**
 * Compact token count display: "1.2k", "15.4k", etc.
 */
export function tokens(count: number): string {
  if (count < 1000) return String(count)
  return `${(count / 1000).toFixed(1)}k`
}

/**
 * Format cost in dollars: "$0.0012", "$1.23".
 */
export function cost(amount: number): string {
  if (amount === 0) return "$0"
  if (amount < 0.01) return `$${amount.toFixed(4)}`
  return `$${amount.toFixed(2)}`
}
