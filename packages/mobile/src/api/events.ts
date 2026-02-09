import type { OpencodeClient, Event } from "@opencode-ai/sdk/client"
import { useSessionStore } from "@/store/sessions"
import { useMessageStore } from "@/store/messages"

/**
 * SSE event subscription with coalescing and frame-aligned batching.
 *
 * Mirrors the web app's architecture:
 * 1. Events arrive from the SSE stream
 * 2. High-frequency events are coalesced (only latest survives per key)
 * 3. Batched and flushed at ~16ms intervals (one frame at 60fps)
 * 4. Applied to Zustand stores via the event reducer
 *
 * Returns a cleanup function that terminates the SSE connection.
 */
export function subscribe(client: OpencodeClient): () => void {
  let aborted = false
  const controller = new AbortController()
  const queue: Array<Event | undefined> = []
  const coalesced = new Map<string, number>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let last = 0

  /**
   * Compute a coalescing key for high-frequency events.
   * Events with the same key are deduplicated — only the latest survives.
   */
  function coalesceKey(event: Event): string | undefined {
    switch (event.type) {
      case "session.status":
        return `session.status:${(event.properties as any).sessionID}`
      case "message.part.updated": {
        const part = (event.properties as any).part
        return `message.part.updated:${part.messageID}:${part.id}`
      }
      default:
        return undefined
    }
  }

  /** Flush the event queue and apply to stores */
  function flush() {
    if (timer) clearTimeout(timer)
    timer = undefined
    if (queue.length === 0) return

    const batch = queue.splice(0)
    coalesced.clear()
    last = Date.now()

    for (const event of batch) {
      if (!event) continue
      applyEvent(event)
    }
  }

  /** Schedule a flush aligned to the next frame boundary (~16ms) */
  function schedule() {
    if (timer) return
    const elapsed = Date.now() - last
    timer = setTimeout(flush, Math.max(0, 16 - elapsed))
  }

  /** Enqueue an event, coalescing duplicates */
  function enqueue(event: Event) {
    const k = coalesceKey(event)
    if (k) {
      const existing = coalesced.get(k)
      if (existing !== undefined) {
        queue[existing] = undefined
      }
      coalesced.set(k, queue.length)
    }
    queue.push(event)
    schedule()
  }

  // Start the SSE stream
  void (async () => {
    try {
      const result = await client.event.subscribe({
        signal: controller.signal,
      })

      for await (const event of result.stream) {
        if (aborted) break
        enqueue(event as Event)
      }
    } catch (err) {
      if (!aborted) {
        console.warn("[sse] Stream error, will reconnect:", err)
        // Auto-reconnect after delay (SDK has built-in retry,
        // but if the stream ends we restart manually)
        if (!aborted) {
          setTimeout(() => {
            if (!aborted) subscribe(client)
          }, 3000)
        }
      }
    } finally {
      flush()
    }
  })()

  return () => {
    aborted = true
    controller.abort()
    flush()
  }
}

/**
 * Route an SSE event to the appropriate Zustand store.
 * This is the event reducer — the single place where SSE events
 * are translated into state mutations.
 */
function applyEvent(event: Event) {
  const sessions = useSessionStore.getState()
  const messages = useMessageStore.getState()
  const props = event.properties as any

  switch (event.type) {
    case "session.created":
    case "session.updated":
      sessions.upsert(props.info)
      break

    case "session.deleted":
      sessions.remove(props.info.id)
      messages.clear(props.info.id)
      break

    case "session.status":
      sessions.setStatus(props.sessionID, props.status)
      break

    case "message.updated":
      messages.upsertMessage(props.info.sessionID, props.info)
      break

    case "message.removed":
      messages.removeMessage(props.sessionID, props.messageID)
      break

    case "message.part.updated":
      messages.upsertPart(props.part.messageID, props.part)
      break

    case "message.part.removed":
      messages.removePart(props.messageID, props.partID)
      break

    // Events we acknowledge but don't need to handle yet in Phase 1:
    // permission.updated, permission.replied, session.idle, session.compacted,
    // session.error, session.diff, todo.updated, lsp.*, server.*, etc.
    default:
      break
  }
}
