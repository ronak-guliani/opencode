import type { Event } from "@opencode-ai/sdk/client"
import { url, headers } from "./client"
import { useSessions } from "../store/sessions"
import { useMessages } from "../store/messages"
import { useConnection } from "../store/connection"

// Set to true temporarily when debugging SSE issues on device
const DEBUG = __DEV__

type Subscriber = {
  active: boolean
  xhr: XMLHttpRequest | null
}

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

function apply(event: Event) {
  const sessions = useSessions.getState()
  const messages = useMessages.getState()

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
      if (DEBUG) console.log("[sse] message.updated", event.properties.info.id, event.properties.info.role)
      messages._upsertMessage(event.properties.info.sessionID, event.properties.info)
      break
    case "message.removed":
      messages._removeMessage(event.properties.sessionID, event.properties.messageID)
      break
    case "message.part.updated":
      if (DEBUG) console.log("[sse] part.updated", event.properties.part.id, event.properties.part.type)
      messages._upsertPart(event.properties.part.messageID, event.properties.part)
      break
    case "message.part.removed":
      messages._removePart(event.properties.messageID, event.properties.partID)
      break
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

function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!subscriber?.active) {
      reject(new Error("cancelled"))
      return
    }

    const queue: Event[] = []
    let timer: ReturnType<typeof setTimeout> | null = null

    function flush() {
      const batch = queue.splice(0)
      for (const event of batch) {
        apply(event)
      }
      timer = null
    }

    const xhr = new XMLHttpRequest()
    subscriber.xhr = xhr

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
      if (!subscriber?.active) return

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
        if (!subscriber?.active) break
        coalesce(queue, event)
        if (!timer) timer = setTimeout(flush, 16)
      }
    }

    xhr.onerror = () => {
      if (DEBUG) console.warn("[sse] xhr error")
      subscriber!.xhr = null
      reject(new Error("xhr error"))
    }

    xhr.onload = () => {
      // Stream ended — server closed connection
      if (DEBUG) console.log("[sse] stream ended (onload)")
      subscriber!.xhr = null
      // Flush any remaining buffer
      if (buffer.trim()) {
        const { events } = parseSSE(buffer + "\n\n")
        for (const event of events) {
          apply(event)
        }
      }
      if (timer) {
        clearTimeout(timer)
        flush()
      }
      resolve()
    }

    xhr.onabort = () => {
      subscriber!.xhr = null
      reject(new Error("aborted"))
    }

    xhr.send()
  })
}

export async function subscribe() {
  if (subscriber?.active) return

  subscriber = { active: true, xhr: null }

  let delay = 1000

  while (subscriber.active) {
    try {
      await connect()
      // Stream ended cleanly — reconnect immediately
      if (subscriber.active) {
        delay = 1000
        useConnection.getState().setStream("reconnecting")
      }
    } catch (e) {
      if (!subscriber.active) break
      useConnection.getState().setStream("reconnecting")
      if (DEBUG) console.warn("[sse] reconnecting in", delay, "ms:", e)
      await sleep(delay)
      delay = Math.min(delay * 2, 30000)
    }
  }
}

export function unsubscribe() {
  if (subscriber) {
    subscriber.active = false
    if (subscriber.xhr) {
      subscriber.xhr.abort()
      subscriber.xhr = null
    }
    subscriber = null
    useConnection.getState().setStream("disconnected")
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
