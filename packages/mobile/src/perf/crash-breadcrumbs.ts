type BreadcrumbLevel = "log" | "warn" | "error"

type BreadcrumbEntry = {
  at: number
  event: string
  level: BreadcrumbLevel
  data?: Record<string, unknown>
}

type GlobalWithBreadcrumbs = typeof globalThis & {
  __OPENCODE_MOBILE_CRASH_BREADCRUMBS__?: BreadcrumbEntry[]
  __OPENCODE_MOBILE_CRASH_BREADCRUMBS_DEBUG__?: boolean
}

const MAX_BREADCRUMBS = 160
const DATA_STRING_LIMIT = 160

function globalState(): GlobalWithBreadcrumbs {
  return globalThis as GlobalWithBreadcrumbs
}

function ensureStore() {
  const state = globalState()
  if (!Array.isArray(state.__OPENCODE_MOBILE_CRASH_BREADCRUMBS__)) {
    state.__OPENCODE_MOBILE_CRASH_BREADCRUMBS__ = []
  }
  return state.__OPENCODE_MOBILE_CRASH_BREADCRUMBS__
}

function trimText(value: string) {
  if (value.length <= DATA_STRING_LIMIT) return value
  return `${value.slice(0, DATA_STRING_LIMIT)}...`
}

function compactValue(value: unknown): unknown {
  if (typeof value === "string") return trimText(value)
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value
  if (Array.isArray(value)) {
    return value.slice(0, 6).map(compactValue)
  }
  if (typeof value === "object") {
    const source = value as Record<string, unknown>
    const entries = Object.entries(source).slice(0, 12)
    const next: Record<string, unknown> = {}
    for (const [key, nestedValue] of entries) {
      next[key] = compactValue(nestedValue)
    }
    return next
  }
  return String(value)
}

export function addCrashBreadcrumb(event: string, data?: Record<string, unknown>, level: BreadcrumbLevel = "log") {
  const entry: BreadcrumbEntry = {
    at: Date.now(),
    event,
    level,
    data: data ? (compactValue(data) as Record<string, unknown>) : undefined,
  }

  const store = ensureStore()
  store.push(entry)
  if (store.length > MAX_BREADCRUMBS) {
    store.splice(0, store.length - MAX_BREADCRUMBS)
  }

  const state = globalState()
  const debug = state.__OPENCODE_MOBILE_CRASH_BREADCRUMBS_DEBUG__ ?? false
  if (!debug) return

  const prefix = `[crumb:${level}] ${event}`
  if (level === "error") {
    console.error(prefix, entry.data ?? "")
    return
  }
  if (level === "warn") {
    console.warn(prefix, entry.data ?? "")
    return
  }
  console.log(prefix, entry.data ?? "")
}

export function readCrashBreadcrumbs() {
  return [...ensureStore()]
}

export function clearCrashBreadcrumbs() {
  const store = ensureStore()
  store.length = 0
}
