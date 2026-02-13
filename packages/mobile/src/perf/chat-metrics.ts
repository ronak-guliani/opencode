type ChatOpenMetrics = {
  start: number
  firstPaint?: number
  interactionReady?: number
}

const metrics = new Map<string, ChatOpenMetrics>()

function now() {
  return globalThis.performance?.now?.() ?? Date.now()
}

function log(sessionID: string, metric: ChatOpenMetrics) {
  if (!__DEV__) return
  const toMs = (value?: number) => (typeof value === "number" ? `${value.toFixed(1)}ms` : "n/a")
  const firstPaint = metric.firstPaint ? metric.firstPaint - metric.start : undefined
  const ready = metric.interactionReady ? metric.interactionReady - metric.start : undefined
  console.log(`[chat-metrics] session=${sessionID} firstPaint=${toMs(firstPaint)} interactionReady=${toMs(ready)}`)
}

export function markChatOpenStart(sessionID: string) {
  metrics.set(sessionID, { start: now() })
}

export function markChatFirstPaint(sessionID: string, messageCount: number) {
  if (messageCount <= 0) return
  const metric = metrics.get(sessionID)
  if (!metric || metric.firstPaint) return
  metric.firstPaint = now()
  log(sessionID, metric)
  if (metric.interactionReady) {
    metrics.delete(sessionID)
  }
}

export function markChatInteractionReady(sessionID: string) {
  const metric = metrics.get(sessionID)
  if (!metric || metric.interactionReady) return
  metric.interactionReady = now()
  log(sessionID, metric)
  if (metric.firstPaint) {
    metrics.delete(sessionID)
  }
}
