type EventCategory = "chat" | "session" | "diff" | "sidebar" | "composer" | "drawer" | "api" | "error" | "perf" | "ui"

type TelemetryEntry = {
  at: number
  category: EventCategory
  event: string
  data?: Record<string, unknown>
  duration?: number
}

type GlobalWithTelemetry = typeof globalThis & {
  __OPENCODE_MOBILE_TELEMETRY__?: TelemetryEntry[]
  __OPENCODE_MOBILE_TELEMETRY_DEBUG__?: boolean
}

const MAX_ENTRIES = 320
const DATA_STRING_LIMIT = 200

function state(): GlobalWithTelemetry {
  return globalThis as GlobalWithTelemetry
}

function store() {
  const g = state()
  if (!Array.isArray(g.__OPENCODE_MOBILE_TELEMETRY__)) {
    g.__OPENCODE_MOBILE_TELEMETRY__ = []
  }
  return g.__OPENCODE_MOBILE_TELEMETRY__
}

function compact(value: unknown): unknown {
  if (typeof value === "string")
    return value.length <= DATA_STRING_LIMIT ? value : `${value.slice(0, DATA_STRING_LIMIT)}...`
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value
  if (Array.isArray(value)) return value.slice(0, 8).map(compact)
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 14)
    const result: Record<string, unknown> = {}
    for (const [k, v] of entries) result[k] = compact(v)
    return result
  }
  return String(value)
}

function push(entry: TelemetryEntry) {
  const s = store()
  s.push(entry)
  if (s.length > MAX_ENTRIES) s.splice(0, s.length - MAX_ENTRIES)

  if (state().__OPENCODE_MOBILE_TELEMETRY_DEBUG__) {
    const dur = entry.duration ? ` (${entry.duration.toFixed(1)}ms)` : ""
    console.log(`[telemetry:${entry.category}] ${entry.event}${dur}`, entry.data ?? "")
  }
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now()
}

export function track(category: EventCategory, event: string, data?: Record<string, unknown>) {
  push({
    at: Date.now(),
    category,
    event,
    data: data ? (compact(data) as Record<string, unknown>) : undefined,
  })
}

type Span = {
  end: (data?: Record<string, unknown>) => void
}

export function span(category: EventCategory, event: string, data?: Record<string, unknown>): Span {
  const start = now()
  return {
    end(extra) {
      const merged = data || extra ? ({ ...data, ...extra } as Record<string, unknown>) : undefined
      push({
        at: Date.now(),
        category,
        event,
        data: merged ? (compact(merged) as Record<string, unknown>) : undefined,
        duration: now() - start,
      })
    },
  }
}

export function error(category: EventCategory, event: string, data?: Record<string, unknown>) {
  push({
    at: Date.now(),
    category,
    event: `error:${event}`,
    data: data ? (compact(data) as Record<string, unknown>) : undefined,
  })
}

export function entries() {
  return [...store()]
}

export function clear() {
  store().length = 0
}

export const telemetry = { track, span, error, entries, clear }
