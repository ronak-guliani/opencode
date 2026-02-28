type ChatOpenMetrics = {
  start: number
  firstToken?: number
  firstPaint?: number
  interactionReady?: number
}

const metrics = new Map<string, ChatOpenMetrics>()

type StreamBatchMetrics = {
  batchSize: number
  deltaEvents: number
  mergedDeltaChunks: number
}

const STREAM_LOG_EVERY_N_FLUSHES = 12

const streamMetrics = {
  flushes: 0,
  events: 0,
  deltaEvents: 0,
  mergedDeltaChunks: 0,
  lateDeltas: 0,
  lastFlushAt: 0,
  firstTokenSessionIDs: new Set<string>(),
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now()
}

function log(sessionID: string, metric: ChatOpenMetrics) {
  if (!__DEV__) return
  const toMs = (value?: number) => (typeof value === "number" ? `${value.toFixed(1)}ms` : "n/a")
  const firstToken = metric.firstToken ? metric.firstToken - metric.start : undefined
  const firstPaint = metric.firstPaint ? metric.firstPaint - metric.start : undefined
  const ready = metric.interactionReady ? metric.interactionReady - metric.start : undefined
  console.log(
    `[chat-metrics] session=${sessionID} firstToken=${toMs(firstToken)} firstPaint=${toMs(firstPaint)} interactionReady=${toMs(ready)}`,
  )
}

function logStreamBatch(batch: StreamBatchMetrics, flushIntervalMs: number) {
  if (!__DEV__) return
  if (streamMetrics.flushes % STREAM_LOG_EVERY_N_FLUSHES !== 0) return
  const cadence = flushIntervalMs > 0 ? `${flushIntervalMs.toFixed(1)}ms` : "n/a"
  console.log(
    `[stream-metrics] flushes=${streamMetrics.flushes} cadence=${cadence} batch=${batch.batchSize} deltas=${batch.deltaEvents} merged=${batch.mergedDeltaChunks} late=${streamMetrics.lateDeltas}`,
  )
}

export function markChatOpenStart(sessionID: string) {
  metrics.set(sessionID, { start: now() })
}

export function markChatFirstToken(sessionID: string) {
  if (!__DEV__) return
  if (streamMetrics.firstTokenSessionIDs.has(sessionID)) return
  streamMetrics.firstTokenSessionIDs.add(sessionID)

  const metric = metrics.get(sessionID)
  if (!metric || metric.firstToken) return
  metric.firstToken = now()
  log(sessionID, metric)
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

export function markStreamFlush(batch: StreamBatchMetrics) {
  if (!__DEV__) return
  const ts = now()
  const interval = streamMetrics.lastFlushAt > 0 ? ts - streamMetrics.lastFlushAt : 0
  streamMetrics.lastFlushAt = ts
  streamMetrics.flushes += 1
  streamMetrics.events += batch.batchSize
  streamMetrics.deltaEvents += batch.deltaEvents
  streamMetrics.mergedDeltaChunks += batch.mergedDeltaChunks
  logStreamBatch(batch, interval)
}

export function markStreamLateDelta(sessionID: string, messageID: string, partID: string, field: string) {
  if (!__DEV__) return
  streamMetrics.lateDeltas += 1
  if (streamMetrics.lateDeltas <= 5 || streamMetrics.lateDeltas % 20 === 0) {
    console.warn(
      `[stream-metrics] late-delta session=${sessionID} message=${messageID} part=${partID} field=${field} count=${streamMetrics.lateDeltas}`,
    )
  }
}
