import type { Event } from "@opencode-ai/sdk/client"
import { Platform } from "react-native"
import { url, headers } from "./client"
import { useSessions } from "../store/sessions"
import { useMessages } from "../store/messages"
import { useRequests } from "../store/requests"
import { useConnection } from "../store/connection"
import { useDiffs } from "../store/diffs"
import { markStreamFlush } from "../perf/chat-metrics"
import { addCrashBreadcrumb } from "../perf/crash-breadcrumbs"
import { streamFlushPolicy } from "../config/feature-flags"
import { telemetry } from "../perf/telemetry"
import {
  coalesceDeltaBatch,
  parseSSE,
  resolveSessionDiffPayload,
  type AppEvent,
  type MessagePartDeltaEvent,
} from "./events.logic"

// Opt-in debug flag for SSE diagnostics on device:
// globalThis.__OPENCODE_MOBILE_SSE_DEBUG__ = true
const DEBUG =
  __DEV__ && (globalThis as { __OPENCODE_MOBILE_SSE_DEBUG__?: boolean }).__OPENCODE_MOBILE_SSE_DEBUG__ === true

type Subscriber = {
  active: boolean
  xhr: XMLHttpRequest | null
}

type MessageEvent =
  | Extract<Event, { type: "message.updated" }>
  | Extract<Event, { type: "message.removed" }>
  | Extract<Event, { type: "message.part.updated" }>
  | Extract<Event, { type: "message.part.removed" }>
  | MessagePartDeltaEvent

const STREAM_FLUSH_POLICY = streamFlushPolicy()
const EVENT_FLUSH_FALLBACK_MS = Platform.OS === "ios" ? 18 : 24
const STALL_WATCHDOG_INTERVAL_MS = 5_000
const STALL_TIMEOUT_MS = 30_000
const IDLE_MESSAGE_RESYNC_LIMIT = 80

let subscriber: Subscriber | null = null

function coalesce(queue: AppEvent[], event: AppEvent): { mergedDeltaChunk: boolean } {
  if (event.type === "message.part.delta") {
    const previous = queue[queue.length - 1]
    if (previous?.type === "message.part.delta") {
      const sameKey =
        previous.properties.sessionID === event.properties.sessionID &&
        previous.properties.messageID === event.properties.messageID &&
        previous.properties.partID === event.properties.partID &&
        previous.properties.field === event.properties.field
      if (sameKey) {
        previous.properties.delta += event.properties.delta
        return { mergedDeltaChunk: true }
      }
    }
    queue.push(event)
    return { mergedDeltaChunk: false }
  }

  const key = eventKey(event)
  if (!key) {
    queue.push(event)
    return { mergedDeltaChunk: false }
  }
  const idx = queue.findIndex((e) => eventKey(e) === key)
  if (idx >= 0) {
    queue[idx] = event
  } else {
    queue.push(event)
  }
  return { mergedDeltaChunk: false }
}

function eventKey(event: AppEvent): string | null {
  switch (event.type) {
    case "session.status":
      return `session.status:${event.properties.sessionID}`
    case "session.idle":
      return `session.idle:${event.properties.sessionID}`
    case "message.part.updated":
      return `part:${event.properties.part.id}`
    case "message.updated":
      return `message:${event.properties.info.id}`
    case "permission.updated":
      return `permission:${event.properties.id}`
    case "permission.replied":
      return `permission.replied:${event.properties.permissionID}`
    case "session.diff":
      return `session.diff:${event.properties.sessionID}`
    case "message.part.delta":
      return null
    default:
      return null
  }
}

function applyBatch(events: AppEvent[]) {
  if (events.length === 0) return

  const sessions = useSessions.getState()
  const messages = useMessages.getState()
  const requests = useRequests.getState()
  const diffs = useDiffs.getState()
  const messageEvents: MessageEvent[] = []

  for (const event of events) {
    try {
      switch (event.type) {
        case "session.created":
        case "session.updated":
          sessions._upsert(event.properties.info)
          break
        case "session.deleted":
          sessions._remove(event.properties.info.id)
          break
        case "session.status":
          sessions._setStatus(event.properties.sessionID, event.properties.status)
          break
        case "session.idle":
          // Session finished — set status to idle and refresh diff data
          sessions._setStatus(event.properties.sessionID, { type: "idle" })
          void diffs.fetchSessionDiff(event.properties.sessionID, { force: true })
          void messages
            .load(event.properties.sessionID, {
              force: true,
              limit: IDLE_MESSAGE_RESYNC_LIMIT,
            })
            .catch(() => {
              // ignore
            })
          break
        case "session.diff":
          {
            const nextDiff = resolveSessionDiffPayload(event.properties as { diff?: unknown; diffs?: unknown })
            diffs.setSessionDiff(event.properties.sessionID, nextDiff as never[])
          }
          break
        case "message.updated":
        case "message.removed":
        case "message.part.updated":
        case "message.part.delta":
        case "message.part.removed":
          if (DEBUG && event.type === "message.updated") {
            console.log("[sse] message.updated", event.properties.info.id, event.properties.info.role)
          }
          if (DEBUG && event.type === "message.part.updated") {
            console.log("[sse] part.updated", event.properties.part.id, event.properties.part.type)
          }
          if (DEBUG && event.type === "message.part.delta") {
            console.log(
              "[sse] part.delta",
              event.properties.partID,
              event.properties.field,
              event.properties.delta.length,
            )
          }
          messageEvents.push(event)
          break
        case "permission.updated":
          requests._upsertPermission(event.properties)
          break
        case "permission.replied":
          requests._removePermission(event.properties.permissionID)
          break
      }
    } catch (error) {
      if (DEBUG) console.warn("[sse] failed to apply event", event.type, error)
    }
  }

  if (messageEvents.length > 0) {
    messages._applyEvents(messageEvents)
  }
}

function connect(current: Subscriber): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!current.active) {
      reject(new Error("cancelled"))
      return
    }

    const queue: AppEvent[] = []
    let timer: ReturnType<typeof setTimeout> | null = null
    let raf: number | null = null
    let watchdog: ReturnType<typeof setInterval> | null = null
    let lastFlushAt = 0
    let adaptiveFlushMs = STREAM_FLUSH_POLICY.minMs
    let lastProgressAt = Date.now()
    let pendingMergedDeltaChunks = 0

    function flush() {
      if (raf !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(raf)
      }
      raf = null
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      const queued = queue.splice(0)
      if (queued.length === 0) {
        pendingMergedDeltaChunks = 0
        return
      }

      const { events: batch, merged, deltaEvents } = coalesceDeltaBatch(queued, STREAM_FLUSH_POLICY.coalesceDeltaByKey)
      const start = globalThis.performance?.now?.() ?? Date.now()
      applyBatch(batch)
      const elapsed = (globalThis.performance?.now?.() ?? Date.now()) - start
      lastFlushAt = Date.now()

      if (elapsed > STREAM_FLUSH_POLICY.budgetMs) {
        adaptiveFlushMs = Math.min(STREAM_FLUSH_POLICY.maxMs, adaptiveFlushMs + 4)
      } else if (queue.length < 20) {
        adaptiveFlushMs = Math.max(STREAM_FLUSH_POLICY.minMs, adaptiveFlushMs - 1)
      }

      markStreamFlush({
        batchSize: batch.length,
        deltaEvents,
        mergedDeltaChunks: pendingMergedDeltaChunks + merged,
      })
      pendingMergedDeltaChunks = 0
    }

    function scheduleFlush() {
      if (raf !== null || timer) return
      const elapsed = Date.now() - lastFlushAt
      const waitMs = elapsed >= adaptiveFlushMs ? 0 : adaptiveFlushMs - elapsed
      const canUseRaf = typeof requestAnimationFrame === "function" && typeof cancelAnimationFrame === "function"

      if (waitMs > 0 || !canUseRaf) {
        timer = setTimeout(
          () => {
            timer = null
            flush()
          },
          waitMs > 0 ? waitMs : EVENT_FLUSH_FALLBACK_MS,
        )
        return
      }

      raf = requestAnimationFrame(() => {
        raf = null
        flush()
      })
      timer = setTimeout(() => {
        if (raf !== null && typeof cancelAnimationFrame === "function") {
          cancelAnimationFrame(raf)
          raf = null
        }
        timer = null
        flush()
      }, EVENT_FLUSH_FALLBACK_MS)
    }

    const xhr = new XMLHttpRequest()
    current.xhr = xhr

    let lastIndex = 0
    let buffer = ""
    let opened = false

    xhr.open("GET", `${url()}/event`)
    xhr.setRequestHeader("Accept", "text/event-stream")
    xhr.setRequestHeader("Cache-Control", "no-cache")

    const h = headers()
    for (const k of Object.keys(h)) {
      xhr.setRequestHeader(k, h[k])
    }

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3 && !opened) {
        opened = true
        lastProgressAt = Date.now()
        if (DEBUG) console.log("[sse] connection opened")
        useConnection.getState().setStream("connected")
        telemetry.track("api", "sse:connected")
      }
    }

    xhr.onprogress = () => {
      if (!current.active) return

      const raw = xhr.responseText.slice(lastIndex)
      lastIndex = xhr.responseText.length

      if (!raw) return
      lastProgressAt = Date.now()

      if (DEBUG && raw.length > 0) {
        console.log("[sse] chunk received:", raw.length, "bytes")
      }

      buffer += raw
      const { events, remaining } = parseSSE(buffer)
      buffer = remaining

      if (DEBUG && events.length > 0) {
        console.log("[sse] parsed", events.length, "events:", events.map((e) => e.type).join(", "))
      }

      for (const event of events) {
        if (!current.active) break
        const result = coalesce(queue, event)
        if (result.mergedDeltaChunk) {
          pendingMergedDeltaChunks += 1
        }
        if (queue.length > 160) {
          adaptiveFlushMs = STREAM_FLUSH_POLICY.maxMs
        } else if (queue.length > 80) {
          adaptiveFlushMs = Math.min(STREAM_FLUSH_POLICY.maxMs, adaptiveFlushMs + 2)
        }
        scheduleFlush()
      }
    }

    watchdog = setInterval(() => {
      if (!current.active || !current.xhr) return
      const idleFor = Date.now() - lastProgressAt
      if (idleFor < STALL_TIMEOUT_MS) return
      if (DEBUG) {
        console.warn("[sse] stall watchdog aborting stream after", idleFor, "ms without progress")
      }
      telemetry.error("api", "sse:stall-abort", { idleMs: idleFor })
      try {
        current.xhr.abort()
      } catch {
        // ignore
      }
    }, STALL_WATCHDOG_INTERVAL_MS)

    xhr.onerror = () => {
      if (DEBUG) console.warn("[sse] xhr error")
      telemetry.error("api", "sse:error")
      if (watchdog) {
        clearInterval(watchdog)
        watchdog = null
      }
      if (raf !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(raf)
      }
      raf = null
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      current.xhr = null
      reject(new Error("xhr error"))
    }

    xhr.onload = () => {
      // Stream ended — server closed connection
      if (DEBUG) console.log("[sse] stream ended (onload)")
      telemetry.track("api", "sse:stream-ended")
      if (watchdog) {
        clearInterval(watchdog)
        watchdog = null
      }
      current.xhr = null
      // Flush any remaining buffer
      if (buffer.trim()) {
        const { events } = parseSSE(buffer + "\n\n")
        for (const event of events) {
          const result = coalesce(queue, event)
          if (result.mergedDeltaChunk) {
            pendingMergedDeltaChunks += 1
          }
        }
      }
      if (queue.length > 0 || timer || raf !== null) {
        flush()
      }
      resolve()
    }

    xhr.onabort = () => {
      if (watchdog) {
        clearInterval(watchdog)
        watchdog = null
      }
      if (raf !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(raf)
      }
      raf = null
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      current.xhr = null
      reject(new Error("aborted"))
    }

    xhr.send()
  })
}

export async function subscribe() {
  if (subscriber?.active) return

  const current: Subscriber = { active: true, xhr: null }
  subscriber = current

  let delay = 1000

  while (current.active) {
    try {
      await connect(current)
      // Stream ended cleanly — reconnect immediately
      if (current.active) {
        delay = 1000
        useConnection.getState().setStream("reconnecting")
      }
    } catch (e) {
      if (!current.active) break
      useConnection.getState().setStream("reconnecting")
      if (DEBUG) console.warn("[sse] reconnecting in", delay, "ms:", e)
      telemetry.track("api", "sse:reconnecting", { delayMs: delay })
      await sleep(delay, () => current.active)
      delay = Math.min(delay * 2, 30000)
    }
  }

  if (subscriber === current) {
    subscriber = null
  }
}

export function unsubscribe() {
  const current = subscriber
  if (current) {
    current.active = false
    if (current.xhr) {
      current.xhr.abort()
      current.xhr = null
    }
    if (subscriber === current) subscriber = null
    useConnection.getState().setStream("disconnected")
  }
}

function sleep(ms: number, isActive: () => boolean) {
  return new Promise<void>((resolve) => {
    const start = Date.now()
    const tick = () => {
      if (!isActive()) {
        resolve()
        return
      }
      if (Date.now() - start >= ms) {
        resolve()
        return
      }
      setTimeout(tick, 100)
    }
    tick()
  })
}
