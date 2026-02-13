import type { Event } from "@opencode-ai/sdk/client"
import { url, headers } from "./client"
import { useSessions } from "../store/sessions"
import { useMessages } from "../store/messages"
import { useConnection } from "../store/connection"

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

const EVENT_FLUSH_MS = 24

let subscriber: Subscriber | null = null

function coalesce(queue: Event[], event: Event): void {
  const key = eventKey(event)
  if (!key) {
    queue.push(event)
    return
  }
  const idx = queue.findIndex((e) => eventKey(e) === key)
  if (idx >= 0) {
    queue[idx] = event
  } else {
    queue.push(event)
  }
}

function eventKey(event: Event): string | null {
  switch (event.type) {
    case "session.status":
      return `session.status:${event.properties.sessionID}`
    case "message.part.updated":
      return `part:${event.properties.part.id}`
    case "message.updated":
      return `message:${event.properties.info.id}`
    default:
      return null
  }
}

function applyBatch(events: Event[]) {
  if (events.length === 0) return

  const sessions = useSessions.getState()
  const messages = useMessages.getState()
  const messageEvents: MessageEvent[] = []

  for (const event of events) {
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
      case "message.updated":
      case "message.removed":
      case "message.part.updated":
      case "message.part.removed":
        if (DEBUG && event.type === "message.updated") {
          console.log("[sse] message.updated", event.properties.info.id, event.properties.info.role)
        }
        if (DEBUG && event.type === "message.part.updated") {
          console.log("[sse] part.updated", event.properties.part.id, event.properties.part.type)
        }
        messageEvents.push(event)
        break
    }
  }

  if (messageEvents.length > 0) {
    messages._applyEvents(messageEvents)
  }
}

// Parse SSE events from a text buffer.
// Returns parsed events and the remaining incomplete buffer.
function parseSSE(buffer: string): { events: Event[]; remaining: string } {
  buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const chunks = buffer.split("\n\n")
  const remaining = chunks.pop() ?? ""
  const events: Event[] = []

  for (const chunk of chunks) {
    if (!chunk.trim()) continue
    const lines = chunk.split("\n")
    const dataLines: string[] = []

    for (const line of lines) {
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart())
      }
    }

    if (!dataLines.length) continue

    try {
      const parsed = JSON.parse(dataLines.join("\n")) as Event
      events.push(parsed)
    } catch {
      if (DEBUG) console.warn("[sse] failed to parse:", dataLines.join("\n").slice(0, 100))
    }
  }

  return { events, remaining }
}

function connect(current: Subscriber): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!current.active) {
      reject(new Error("cancelled"))
      return
    }

    const queue: Event[] = []
    let timer: ReturnType<typeof setTimeout> | null = null

    function flush() {
      const batch = queue.splice(0)
      applyBatch(batch)
      timer = null
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
        if (DEBUG) console.log("[sse] connection opened")
        useConnection.getState().setStream("connected")
      }
    }

    xhr.onprogress = () => {
      if (!current.active) return

      const raw = xhr.responseText.slice(lastIndex)
      lastIndex = xhr.responseText.length

      if (!raw) return

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
        coalesce(queue, event)
        if (!timer) timer = setTimeout(flush, EVENT_FLUSH_MS)
      }
    }

    xhr.onerror = () => {
      if (DEBUG) console.warn("[sse] xhr error")
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
      current.xhr = null
      // Flush any remaining buffer
      if (buffer.trim()) {
        const { events } = parseSSE(buffer + "\n\n")
        applyBatch(events)
      }
      if (timer) {
        clearTimeout(timer)
        flush()
      }
      resolve()
    }

    xhr.onabort = () => {
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
