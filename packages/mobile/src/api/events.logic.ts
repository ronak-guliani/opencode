import type { Event } from "@opencode-ai/sdk/client"

export type MessagePartDeltaEvent = {
  type: "message.part.delta"
  properties: {
    sessionID: string
    messageID: string
    partID: string
    field: string
    delta: string
  }
}

export type AppEvent = Event | MessagePartDeltaEvent

function isPartDeltaEvent(event: AppEvent): event is MessagePartDeltaEvent {
  return event.type === "message.part.delta"
}

function deltaKey(event: MessagePartDeltaEvent) {
  return `${event.properties.sessionID}:${event.properties.messageID}:${event.properties.partID}:${event.properties.field}`
}

export function resolveSessionDiffPayload(payload: { diff?: unknown; diffs?: unknown }) {
  if (Array.isArray(payload.diff)) return payload.diff
  if (Array.isArray(payload.diffs)) return payload.diffs
  return []
}

export function coalesceDeltaBatch(events: AppEvent[], coalesceDeltaByKey: boolean) {
  const deltaEvents = events.reduce((acc, event) => (event.type === "message.part.delta" ? acc + 1 : acc), 0)
  if (!coalesceDeltaByKey) {
    return {
      events,
      merged: 0,
      deltaEvents,
    }
  }

  const merged: AppEvent[] = []
  let mergedCount = 0

  for (const event of events) {
    if (!isPartDeltaEvent(event)) {
      merged.push(event)
      continue
    }

    const previous = merged[merged.length - 1]
    if (previous && isPartDeltaEvent(previous) && deltaKey(previous) === deltaKey(event)) {
      previous.properties.delta += event.properties.delta
      mergedCount += 1
      continue
    }

    merged.push({
      ...event,
      properties: { ...event.properties },
    })
  }

  return {
    events: merged,
    merged: mergedCount,
    deltaEvents,
  }
}

export function parseSSE(buffer: string): { events: AppEvent[]; remaining: string } {
  buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const chunks = buffer.split("\n\n")
  const remaining = chunks.pop() ?? ""
  const events: AppEvent[] = []

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
      const parsed = JSON.parse(dataLines.join("\n")) as AppEvent
      events.push(parsed)
    } catch {
      // ignore malformed chunks
    }
  }

  return { events, remaining }
}
