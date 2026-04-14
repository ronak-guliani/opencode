import AsyncStorage from "@react-native-async-storage/async-storage"
import { create as createStore } from "zustand"
import type { Event, Message, Part } from "@opencode-ai/sdk/client"
import { client, url as clientUrl } from "../api/client"
import { useSessions } from "./sessions"
import { useSettings } from "./settings"
import { normalizeServerUrl } from "../util/server"
import { markChatFirstToken, markStreamLateDelta } from "../perf/chat-metrics"
import { addCrashBreadcrumb } from "../perf/crash-breadcrumbs"
import { telemetry } from "../perf/telemetry"

type MessagePartDeltaEvent = {
  type: "message.part.delta"
  properties: {
    sessionID: string
    messageID: string
    partID: string
    field: string
    delta: string
  }
}

type MessageEvent =
  | Extract<Event, { type: "message.updated" }>
  | Extract<Event, { type: "message.removed" }>
  | Extract<Event, { type: "message.part.updated" }>
  | Extract<Event, { type: "message.part.removed" }>
  | MessagePartDeltaEvent

type MessageState = {
  messages: Record<string, Message[]>
  parts: Record<string, Part[]>
  messageIndexBySession: Record<string, Record<string, number>>
  partIndexByMessage: Record<string, Record<string, number>>
  partsVersionBySession: Record<string, number>
  lastMessageIDBySession: Record<string, string>
  sending: Record<string, boolean>
  loading: Record<string, boolean>
  prefetching: Record<string, boolean>
  hydrating: Record<string, boolean>
  loadedAt: Record<string, number>
  exhausted: Record<string, boolean>
  oldestCursor: Record<string, string | null>
  hydrated: Record<string, boolean>
  sessionOrder: string[]
  reset: () => void
  load: (sessionID: string, opts?: { force?: boolean; limit?: number; trimToRecent?: number }) => Promise<void>
  loadMore: (sessionID: string) => Promise<void>
  prefetch: (sessionIDs: string[], opts?: { limit?: number }) => Promise<void>
  hydrateMessage: (sessionID: string, messageID: string) => Promise<void>
  send: (sessionID: string, content: string) => Promise<void>
  sendNew: (content: string) => Promise<string>
  abort: (sessionID: string) => Promise<void>
  _applyEvents: (events: MessageEvent[]) => void
  _upsertMessage: (sessionID: string, message: Message) => void
  _removeMessage: (sessionID: string, messageID: string) => void
  _upsertPart: (messageID: string, part: Part) => void
  _removePart: (messageID: string, partID: string) => void
}

type MessageWithParts = { info: Message; parts: Part[] }

type CachedSession = {
  savedAt: number
  oldestCursor: string | null
  exhausted: boolean
  entries: MessageWithParts[]
}

const MESSAGE_CACHE_TTL_MS = 5 * 60_000
const PERSISTED_CACHE_TTL_MS = 24 * 60 * 60_000
const INITIAL_MESSAGE_LIMIT = 6
const LOAD_MORE_STEP = 20
const PREFETCH_LIMIT = 12
const MAX_MESSAGE_LIMIT = 5_000
const FAST_TRIM_SKIP_CLEANUP_THRESHOLD = 320
const MAX_ACTIVE_SESSIONS = 8
const MAX_PERSISTED_SESSIONS = 12
const MAX_PERSISTED_MESSAGES_PER_SESSION = 140
const PERSIST_MIN_INTERVAL_MS = 3_000
const CACHE_KEY_PREFIX = "opencode-mobile:chat-cache:v2:"
const MAX_PENDING_DELTA_ENTRIES = 1200
const PENDING_DELTA_TRIM_TARGET = 900

const persistTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Synchronous in-process cache — survives Zustand LRU eviction.
// Keyed by sessionID, holds the same shape as CachedSession.
// Written whenever entries are applied; read synchronously in load() before
// touching AsyncStorage, making evicted-session restores instant.
const memorySessionCache = new Map<string, CachedSession>()

export class SendMessageError extends Error {
  readonly sessionID: string
  readonly content: string
  readonly originalError: unknown

  constructor(params: { sessionID: string; content: string; originalError: unknown }) {
    super("Failed to send message")
    this.name = "SendMessageError"
    this.sessionID = params.sessionID
    this.content = params.content
    this.originalError = params.originalError
  }
}

function sortMessages(a: Message, b: Message) {
  return a.id.localeCompare(b.id)
}

function buildMessageIndex(messages: Message[]) {
  const index: Record<string, number> = {}
  for (let i = 0; i < messages.length; i += 1) {
    index[messages[i].id] = i
  }
  return index
}

function buildPartIndex(parts: Part[]) {
  const index: Record<string, number> = {}
  for (let i = 0; i < parts.length; i += 1) {
    index[parts[i].id] = i
  }
  return index
}

function findMessageInsertIndex(messages: Message[], messageID: string) {
  let low = 0
  let high = messages.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (messages[mid].id.localeCompare(messageID) < 0) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return low
}

function incrementVersion(map: Record<string, number>, sessionID: string) {
  map[sessionID] = (map[sessionID] ?? 0) + 1
}

function touchSessionOrder(order: string[], sessionID: string) {
  return [sessionID, ...order.filter((id) => id !== sessionID)]
}

function hasTruncatedPart(part: Part): boolean {
  if ((part.type === "text" || part.type === "reasoning") && "truncated" in part) {
    return !!part.truncated
  }
  if (part.type === "tool" && part.state.status === "completed" && "outputTruncated" in part.state) {
    return !!part.state.outputTruncated
  }
  if (part.type === "file" && part.source?.text && "truncated" in part.source.text) {
    return !!part.source.text.truncated
  }
  return false
}

function isHydratedParts(parts: Part[]) {
  return !parts.some(hasTruncatedPart)
}

function cacheScope() {
  try {
    const value = clientUrl()
    return encodeURIComponent(normalizeServerUrl(value) ?? value)
  } catch {
    return "disconnected"
  }
}

function cacheIndexKey() {
  return `${CACHE_KEY_PREFIX}${cacheScope()}:index`
}

function cacheKey(sessionID: string) {
  return `${CACHE_KEY_PREFIX}${cacheScope()}:${sessionID}`
}

async function readCachedSession(sessionID: string) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(sessionID))
    if (!raw) return
    const parsed = JSON.parse(raw) as CachedSession
    if (!parsed || !Array.isArray(parsed.entries)) return
    return parsed
  } catch {
    return
  }
}

async function touchPersistedIndex(sessionID: string) {
  try {
    const key = cacheIndexKey()
    const raw = await AsyncStorage.getItem(key)
    const prev = raw ? ((JSON.parse(raw) as { order?: string[] }).order ?? []) : []
    const order = [sessionID, ...prev.filter((id) => id !== sessionID)]
    const evicted = order.slice(MAX_PERSISTED_SESSIONS)
    const keep = order.slice(0, MAX_PERSISTED_SESSIONS)
    await AsyncStorage.setItem(key, JSON.stringify({ order: keep }))
    if (evicted.length > 0) {
      await AsyncStorage.multiRemove(evicted.map((id) => cacheKey(id)))
    }
  } catch {
    // ignore cache-index errors
  }
}

function trimStateForLRU(state: MessageState, pinSessionID?: string): Partial<MessageState> {
  if (state.sessionOrder.length <= MAX_ACTIVE_SESSIONS) return {}

  const keep = new Set(state.sessionOrder.slice(0, MAX_ACTIVE_SESSIONS))
  if (pinSessionID) keep.add(pinSessionID)

  const evict = state.sessionOrder.filter((sessionID) => !keep.has(sessionID))
  if (evict.length === 0) return {}

  const evictSet = new Set(evict)
  const messages = { ...state.messages }
  const parts = { ...state.parts }
  const messageIndexBySession = { ...state.messageIndexBySession }
  const partIndexByMessage = { ...state.partIndexByMessage }
  const partsVersionBySession = { ...state.partsVersionBySession }
  const lastMessageIDBySession = { ...state.lastMessageIDBySession }
  const sending = { ...state.sending }
  const loading = { ...state.loading }
  const prefetching = { ...state.prefetching }
  const hydrating = { ...state.hydrating }
  const loadedAt = { ...state.loadedAt }
  const exhausted = { ...state.exhausted }
  const oldestCursor = { ...state.oldestCursor }
  const hydrated = { ...state.hydrated }

  for (const sessionID of evict) {
    const sessionMessages = messages[sessionID] ?? []
    for (const message of sessionMessages) {
      delete parts[message.id]
      delete partIndexByMessage[message.id]
      delete hydrated[message.id]
      delete hydrating[message.id]
    }
    delete messages[sessionID]
    delete messageIndexBySession[sessionID]
    delete partsVersionBySession[sessionID]
    delete lastMessageIDBySession[sessionID]
    delete sending[sessionID]
    delete loading[sessionID]
    delete prefetching[sessionID]
    delete loadedAt[sessionID]
    delete exhausted[sessionID]
    delete oldestCursor[sessionID]
  }

  return {
    messages,
    parts,
    messageIndexBySession,
    partIndexByMessage,
    partsVersionBySession,
    lastMessageIDBySession,
    sending,
    loading,
    prefetching,
    hydrating,
    loadedAt,
    exhausted,
    oldestCursor,
    hydrated,
    sessionOrder: state.sessionOrder.filter((sessionID) => !evictSet.has(sessionID)),
  }
}

function mergeMessages(existing: Message[], incoming: Message[]) {
  if (incoming.length === 0) return existing
  if (existing.length === 0) return [...incoming].sort(sortMessages)

  const incomingSorted = [...incoming].sort(sortMessages)
  const merged: Message[] = []
  let i = 0
  let j = 0

  while (i < existing.length && j < incomingSorted.length) {
    const left = existing[i]
    const right = incomingSorted[j]
    const cmp = left.id.localeCompare(right.id)
    if (cmp < 0) {
      merged.push(left)
      i += 1
      continue
    }
    if (cmp > 0) {
      merged.push(right)
      j += 1
      continue
    }
    // Same id: prefer incoming copy from server.
    merged.push(right)
    i += 1
    j += 1
  }

  while (i < existing.length) {
    merged.push(existing[i])
    i += 1
  }
  while (j < incomingSorted.length) {
    merged.push(incomingSorted[j])
    j += 1
  }

  return merged
}

function deltaBufferKey(messageID: string, partID: string, field: string) {
  return `${messageID}:${partID}:${field}`
}

function appendPartDelta(part: Part, field: string, delta: string): Part {
  if (!delta) return part
  const current = (part as Record<string, unknown>)[field]
  if (typeof current === "string") {
    return {
      ...(part as Record<string, unknown>),
      [field]: current + delta,
    } as Part
  }
  if (current === undefined || current === null) {
    return {
      ...(part as Record<string, unknown>),
      [field]: delta,
    } as Part
  }
  return part
}

export const useMessages = createStore<MessageState>((set, get) => {
  // Delta events can arrive before part.updated; buffer until the part exists.
  const pendingDeltas = new Map<string, string>()
  const lastPersistAt = new Map<string, number>()

  const schedulePersist = (sessionID: string) => {
    const existing = persistTimers.get(sessionID)
    if (existing) clearTimeout(existing)

    const now = Date.now()
    const last = lastPersistAt.get(sessionID) ?? 0
    const delay = Math.max(250, PERSIST_MIN_INTERVAL_MS - (now - last))

    const timer = setTimeout(() => {
      persistTimers.delete(sessionID)
      const state = get()
      const fullSessionMessages = state.messages[sessionID] ?? []
      if (fullSessionMessages.length === 0) return

      // Keep cache writes bounded so very large history sessions do not block JS.
      const sessionMessages =
        fullSessionMessages.length > MAX_PERSISTED_MESSAGES_PER_SESSION
          ? fullSessionMessages.slice(-MAX_PERSISTED_MESSAGES_PER_SESSION)
          : fullSessionMessages

      const payload: CachedSession = {
        savedAt: Date.now(),
        oldestCursor: sessionMessages[0]?.id ?? null,
        exhausted: state.exhausted[sessionID] ?? false,
        entries: sessionMessages.map((info) => ({
          info,
          parts: state.parts[info.id] ?? [],
        })),
      }

      void AsyncStorage.setItem(cacheKey(sessionID), JSON.stringify(payload))
        .then(() => touchPersistedIndex(sessionID))
        .catch(() => {
          // ignore cache write errors
        })
      lastPersistAt.set(sessionID, Date.now())
      // Keep fast memory cache in sync with the persisted payload.
      memorySessionCache.set(sessionID, payload)
    }, delay)

    persistTimers.set(sessionID, timer)
  }

  const applyLoadedEntries = (sessionID: string, entries: MessageWithParts[], limit: number, loadedAt: number) => {
    set((state) => {
      const messages = entries.map((entry) => entry.info)
      const nextIDs = new Set(messages.map((message) => message.id))
      const previousMessages = state.messages[sessionID] ?? []
      const parts = { ...state.parts }
      const partIndexByMessage = { ...state.partIndexByMessage }
      const hydrated = { ...state.hydrated }
      const messageIndexBySession = { ...state.messageIndexBySession }
      const partsVersionBySession = { ...state.partsVersionBySession }
      const lastMessageIDBySession = { ...state.lastMessageIDBySession }

      for (const message of previousMessages) {
        if (nextIDs.has(message.id)) continue
        delete parts[message.id]
        delete partIndexByMessage[message.id]
        delete hydrated[message.id]
      }

      for (const entry of entries) {
        parts[entry.info.id] = entry.parts
        partIndexByMessage[entry.info.id] = buildPartIndex(entry.parts)
        hydrated[entry.info.id] = isHydratedParts(entry.parts)
      }

      messageIndexBySession[sessionID] = buildMessageIndex(messages)
      lastMessageIDBySession[sessionID] = messages[messages.length - 1]?.id ?? ""
      incrementVersion(partsVersionBySession, sessionID)

      const sessionOrder = touchSessionOrder(state.sessionOrder, sessionID)
      const next: MessageState = {
        ...state,
        messages: { ...state.messages, [sessionID]: messages },
        parts,
        messageIndexBySession,
        partIndexByMessage,
        partsVersionBySession,
        lastMessageIDBySession,
        hydrated,
        loadedAt: { ...state.loadedAt, [sessionID]: loadedAt },
        exhausted: { ...state.exhausted, [sessionID]: entries.length < limit },
        oldestCursor: {
          ...state.oldestCursor,
          [sessionID]: messages[0]?.id ?? null,
        },
        sessionOrder,
      }

      return {
        ...next,
        ...trimStateForLRU(next, sessionID),
      }
    })

    // Mirror to fast synchronous cache so LRU-evicted sessions restore instantly.
    const saved = Date.now()
    const capped =
      entries.length > MAX_PERSISTED_MESSAGES_PER_SESSION ? entries.slice(-MAX_PERSISTED_MESSAGES_PER_SESSION) : entries
    memorySessionCache.set(sessionID, {
      savedAt: saved,
      oldestCursor: capped[0]?.info.id ?? null,
      exhausted: capped.length < limit,
      entries: capped,
    })
  }

  return {
    messages: {},
    parts: {},
    messageIndexBySession: {},
    partIndexByMessage: {},
    partsVersionBySession: {},
    lastMessageIDBySession: {},
    sending: {},
    loading: {},
    prefetching: {},
    hydrating: {},
    loadedAt: {},
    exhausted: {},
    oldestCursor: {},
    hydrated: {},
    sessionOrder: [],
    reset: () => {
      pendingDeltas.clear()
      lastPersistAt.clear()
      for (const timer of persistTimers.values()) {
        clearTimeout(timer)
      }
      persistTimers.clear()
      set({
        messages: {},
        parts: {},
        messageIndexBySession: {},
        partIndexByMessage: {},
        partsVersionBySession: {},
        lastMessageIDBySession: {},
        sending: {},
        loading: {},
        prefetching: {},
        hydrating: {},
        loadedAt: {},
        exhausted: {},
        oldestCursor: {},
        hydrated: {},
        sessionOrder: [],
      })
    },

    load: async (sessionID, opts) => {
      const s = telemetry.span("chat", "messages:load", { sessionID, limit: opts?.limit })
      const startAt = Date.now()
      addCrashBreadcrumb("messages-load:start", {
        sessionID,
        limit: opts?.limit ?? INITIAL_MESSAGE_LIMIT,
        force: !!opts?.force,
      })
      const state = get()
      if (state.loading[sessionID]) return

      const limit = Math.max(1, Math.min(opts?.limit ?? INITIAL_MESSAGE_LIMIT, MAX_MESSAGE_LIMIT))
      const trimToRecent = Math.max(0, Math.min(opts?.trimToRecent ?? 0, MAX_MESSAGE_LIMIT))
      const now = Date.now()
      const hasMessages = (state.messages[sessionID]?.length ?? 0) > 0
      const loadedAt = state.loadedAt[sessionID]

      if (!opts?.force && trimToRecent > 0 && hasMessages && (state.messages[sessionID]?.length ?? 0) > trimToRecent) {
        s.end({ path: "trim" })
        set((prev) => {
          const existing = prev.messages[sessionID] ?? []
          if (existing.length <= trimToRecent) {
            return {
              sessionOrder: touchSessionOrder(prev.sessionOrder, sessionID),
            }
          }

          const nextMessages = existing.slice(-trimToRecent)
          const trimCount = existing.length - nextMessages.length
          const fastTrim = trimCount >= FAST_TRIM_SKIP_CLEANUP_THRESHOLD

          if (fastTrim) {
            return {
              messages: { ...prev.messages, [sessionID]: nextMessages },
              messageIndexBySession: {
                ...prev.messageIndexBySession,
                [sessionID]: buildMessageIndex(nextMessages),
              },
              lastMessageIDBySession: {
                ...prev.lastMessageIDBySession,
                [sessionID]: nextMessages[nextMessages.length - 1]?.id ?? "",
              },
              oldestCursor: {
                ...prev.oldestCursor,
                [sessionID]: nextMessages[0]?.id ?? null,
              },
              loadedAt: {
                ...prev.loadedAt,
                [sessionID]: Date.now(),
              },
              sessionOrder: touchSessionOrder(prev.sessionOrder, sessionID),
            }
          }

          const keepMessageIDs = new Set(nextMessages.map((message) => message.id))
          const nextParts = { ...prev.parts }
          const nextPartIndexByMessage = { ...prev.partIndexByMessage }
          const nextHydrated = { ...prev.hydrated }
          const nextHydrating = { ...prev.hydrating }

          for (const message of existing) {
            if (keepMessageIDs.has(message.id)) continue
            delete nextParts[message.id]
            delete nextPartIndexByMessage[message.id]
            delete nextHydrated[message.id]
            delete nextHydrating[message.id]
          }

          const partsVersionBySession = { ...prev.partsVersionBySession }
          incrementVersion(partsVersionBySession, sessionID)

          return {
            messages: { ...prev.messages, [sessionID]: nextMessages },
            parts: nextParts,
            messageIndexBySession: {
              ...prev.messageIndexBySession,
              [sessionID]: buildMessageIndex(nextMessages),
            },
            partIndexByMessage: nextPartIndexByMessage,
            partsVersionBySession,
            lastMessageIDBySession: {
              ...prev.lastMessageIDBySession,
              [sessionID]: nextMessages[nextMessages.length - 1]?.id ?? "",
            },
            hydrated: nextHydrated,
            hydrating: nextHydrating,
            oldestCursor: {
              ...prev.oldestCursor,
              [sessionID]: nextMessages[0]?.id ?? null,
            },
            loadedAt: {
              ...prev.loadedAt,
              [sessionID]: Date.now(),
            },
            sessionOrder: touchSessionOrder(prev.sessionOrder, sessionID),
          }
        })
      }

      if (!opts?.force && hasMessages && loadedAt && now - loadedAt < MESSAGE_CACHE_TTL_MS) {
        addCrashBreadcrumb("messages-load:skip-memory-ttl", {
          sessionID,
          ageMs: now - loadedAt,
          count: state.messages[sessionID]?.length ?? 0,
        })
        s.end({ path: "memory-ttl", count: state.messages[sessionID]?.length ?? 0 })
        set((prev) => ({
          sessionOrder: touchSessionOrder(prev.sessionOrder, sessionID),
        }))
        return
      }

      if (!opts?.force && hasMessages) {
        addCrashBreadcrumb("messages-load:skip-memory", {
          sessionID,
          ageMs: loadedAt ? now - loadedAt : -1,
          count: state.messages[sessionID]?.length ?? 0,
        })
        s.end({ path: "memory", count: state.messages[sessionID]?.length ?? 0 })
        set((prev) => ({
          sessionOrder: touchSessionOrder(prev.sessionOrder, sessionID),
        }))
        return
      }

      if (!hasMessages && !opts?.force) {
        // Fast path: synchronous in-process cache — no I/O, survives LRU eviction.
        const memCached = memorySessionCache.get(sessionID)
        if (memCached && memCached.entries.length > 0) {
          const cacheAge = now - memCached.savedAt
          applyLoadedEntries(sessionID, memCached.entries, limit, memCached.savedAt)
          addCrashBreadcrumb("messages-load:mem-cache-hit", {
            sessionID,
            ageMs: cacheAge,
            count: memCached.entries.length,
          })
          s.end({ path: "mem-cache", count: memCached.entries.length })
          // Background refresh if the in-process copy is stale.
          if (cacheAge >= MESSAGE_CACHE_TTL_MS) {
            void get().load(sessionID, { force: true, limit })
          }
          return
        }

        const cached = await readCachedSession(sessionID)
        if (cached && cached.entries.length > 0) {
          const cacheAge = now - cached.savedAt
          applyLoadedEntries(sessionID, cached.entries, limit, cached.savedAt)
          addCrashBreadcrumb("messages-load:cache-hit", {
            sessionID,
            ageMs: cacheAge,
            count: cached.entries.length,
          })
          if (cacheAge >= PERSISTED_CACHE_TTL_MS) {
            addCrashBreadcrumb("messages-load:cache-stale-used", {
              sessionID,
              ageMs: cacheAge,
            })
          }
          s.end({ path: "cache", count: cached.entries.length })
          return
        }
      }

      set((prev) => ({
        loading: {
          ...prev.loading,
          [sessionID]: true,
        },
      }))

      try {
        const requestStart = globalThis.performance?.now?.() ?? Date.now()
        const result = await client().session.messages({
          path: { id: sessionID },
          query: {
            limit,
          },
        })
        const elapsed = (globalThis.performance?.now?.() ?? Date.now()) - requestStart

        if (result.data) {
          const entries = result.data as MessageWithParts[]
          applyLoadedEntries(sessionID, entries, limit, Date.now())
          schedulePersist(sessionID)
          addCrashBreadcrumb("messages-load:network-done", {
            sessionID,
            count: entries.length,
            elapsedMs: Math.round(elapsed),
            totalMs: Date.now() - startAt,
          })
          s.end({ path: "network", count: entries.length, elapsedMs: Math.round(elapsed) })
          if (__DEV__) {
            const bytes = JSON.stringify(result.data).length
            console.log(`[chat-load] ${sessionID} limit=${limit} time=${elapsed.toFixed(1)}ms bytes=${bytes}`)
          }
        }
      } catch (error) {
        s.end({ path: "error" })
        addCrashBreadcrumb(
          "messages-load:error",
          {
            sessionID,
            totalMs: Date.now() - startAt,
            message: error instanceof Error ? error.message : String(error),
          },
          "warn",
        )
      } finally {
        set((prev) => ({
          loading: {
            ...prev.loading,
            [sessionID]: false,
          },
        }))
      }
    },

    loadMore: async (sessionID) => {
      const state = get()
      if (state.loading[sessionID] || state.exhausted[sessionID]) return

      telemetry.track("chat", "messages:loadMore", { sessionID })

      const beforeMessageID = state.oldestCursor[sessionID] ?? state.messages[sessionID]?.[0]?.id
      if (!beforeMessageID) {
        set((prev) => ({
          exhausted: {
            ...prev.exhausted,
            [sessionID]: true,
          },
        }))
        return
      }

      set((prev) => ({
        loading: {
          ...prev.loading,
          [sessionID]: true,
        },
      }))

      try {
        const result = await client().session.messages({
          path: { id: sessionID },
          query: {
            limit: LOAD_MORE_STEP,
            beforeMessageID,
            compact: true,
          },
        })

        if (result.data) {
          const entries = result.data as MessageWithParts[]
          set((prev) => {
            const existingMessages = prev.messages[sessionID] ?? []
            const incomingMessages = entries.map((entry) => entry.info)
            const mergedMessages = mergeMessages(existingMessages, incomingMessages)

            const parts = { ...prev.parts }
            const partIndexByMessage = { ...prev.partIndexByMessage }
            const hydrated = { ...prev.hydrated }
            const partsVersionBySession = { ...prev.partsVersionBySession }
            for (const entry of entries) {
              const messageID = entry.info.id
              if (prev.hydrated[messageID] && prev.parts[messageID]) continue
              parts[messageID] = entry.parts
              partIndexByMessage[messageID] = buildPartIndex(entry.parts)
              hydrated[messageID] = isHydratedParts(entry.parts)
              incrementVersion(partsVersionBySession, sessionID)
            }

            const sessionOrder = touchSessionOrder(prev.sessionOrder, sessionID)
            const next: MessageState = {
              ...prev,
              messages: { ...prev.messages, [sessionID]: mergedMessages },
              parts,
              messageIndexBySession: {
                ...prev.messageIndexBySession,
                [sessionID]: buildMessageIndex(mergedMessages),
              },
              partIndexByMessage,
              partsVersionBySession,
              lastMessageIDBySession: {
                ...prev.lastMessageIDBySession,
                [sessionID]: mergedMessages[mergedMessages.length - 1]?.id ?? "",
              },
              hydrated,
              loadedAt: { ...prev.loadedAt, [sessionID]: Date.now() },
              exhausted: {
                ...prev.exhausted,
                [sessionID]: entries.length < LOAD_MORE_STEP,
              },
              oldestCursor: {
                ...prev.oldestCursor,
                [sessionID]: mergedMessages[0]?.id ?? null,
              },
              sessionOrder,
            }

            return {
              ...next,
              ...trimStateForLRU(next, sessionID),
            }
          })
          schedulePersist(sessionID)
        }
      } catch {
        // ignore
      } finally {
        set((prev) => ({
          loading: {
            ...prev.loading,
            [sessionID]: false,
          },
        }))
      }
    },

    prefetch: async (sessionIDs, opts) => {
      const limit = Math.max(1, Math.min(opts?.limit ?? PREFETCH_LIMIT, PREFETCH_LIMIT))
      for (const sessionID of sessionIDs) {
        if (!sessionID) continue

        const state = get()
        if (state.loading[sessionID] || state.prefetching[sessionID]) continue

        const loadedAt = state.loadedAt[sessionID]
        if (loadedAt && Date.now() - loadedAt < MESSAGE_CACHE_TTL_MS) continue

        set((prev) => ({
          prefetching: {
            ...prev.prefetching,
            [sessionID]: true,
          },
        }))

        try {
          await get().load(sessionID, { limit })
        } finally {
          set((prev) => ({
            prefetching: {
              ...prev.prefetching,
              [sessionID]: false,
            },
          }))
        }
      }
    },

    hydrateMessage: async (sessionID, messageID) => {
      const state = get()
      if (state.hydrated[messageID] || state.hydrating[messageID]) return

      telemetry.track("chat", "messages:hydrate", { sessionID, messageID })

      set((prev) => ({
        hydrating: {
          ...prev.hydrating,
          [messageID]: true,
        },
      }))

      try {
        const result = await client().session.message({
          path: { id: sessionID, messageID },
        })

        if (result.data) {
          const entry = result.data as MessageWithParts
          set((prev) => {
            const existing = prev.messages[sessionID] ?? []
            const existingIndex = prev.messageIndexBySession[sessionID] ?? buildMessageIndex(existing)
            const idx = existingIndex[messageID] ?? -1
            const nextMessages = [...existing]
            if (idx >= 0) {
              nextMessages[idx] = entry.info
            } else {
              nextMessages.splice(findMessageInsertIndex(nextMessages, entry.info.id), 0, entry.info)
            }

            const partIndexByMessage = {
              ...prev.partIndexByMessage,
              [messageID]: buildPartIndex(entry.parts),
            }
            const partsVersionBySession = { ...prev.partsVersionBySession }
            incrementVersion(partsVersionBySession, sessionID)
            const sessionOrder = touchSessionOrder(prev.sessionOrder, sessionID)
            const next: MessageState = {
              ...prev,
              messages: { ...prev.messages, [sessionID]: nextMessages },
              parts: { ...prev.parts, [messageID]: entry.parts },
              messageIndexBySession: {
                ...prev.messageIndexBySession,
                [sessionID]: buildMessageIndex(nextMessages),
              },
              partIndexByMessage,
              partsVersionBySession,
              lastMessageIDBySession: {
                ...prev.lastMessageIDBySession,
                [sessionID]: nextMessages[nextMessages.length - 1]?.id ?? "",
              },
              hydrated: { ...prev.hydrated, [messageID]: true },
              loadedAt: { ...prev.loadedAt, [sessionID]: Date.now() },
              oldestCursor: {
                ...prev.oldestCursor,
                [sessionID]: nextMessages[0]?.id ?? null,
              },
              sessionOrder,
            }

            return {
              ...next,
              ...trimStateForLRU(next, sessionID),
            }
          })
          schedulePersist(sessionID)
        }
      } catch {
        // ignore
      } finally {
        set((prev) => {
          const hydrating = { ...prev.hydrating }
          delete hydrating[messageID]
          return { hydrating }
        })
      }
    },

    send: async (sessionID, content) => {
      telemetry.track("chat", "messages:send", { sessionID, length: content.length })
      const id = `optimistic-user-${Date.now()}`
      const optimisticUser: Message = {
        id,
        sessionID,
        role: "user" as const,
        time: { created: Date.now() },
        agent: "build",
        model: { providerID: "", modelID: "" },
      }
      const optimisticPart: Part = {
        id: `${id}-part`,
        type: "text" as const,
        text: content,
        messageID: id,
      } as Part

      set((state) => {
        const nextMessages = [...(state.messages[sessionID] ?? []), optimisticUser]
        const partsVersionBySession = { ...state.partsVersionBySession }
        incrementVersion(partsVersionBySession, sessionID)
        const sessionOrder = touchSessionOrder(state.sessionOrder, sessionID)
        const next: MessageState = {
          ...state,
          messages: {
            ...state.messages,
            [sessionID]: nextMessages,
          },
          parts: {
            ...state.parts,
            [id]: [optimisticPart],
          },
          messageIndexBySession: {
            ...state.messageIndexBySession,
            [sessionID]: buildMessageIndex(nextMessages),
          },
          partIndexByMessage: {
            ...state.partIndexByMessage,
            [id]: buildPartIndex([optimisticPart]),
          },
          partsVersionBySession,
          lastMessageIDBySession: {
            ...state.lastMessageIDBySession,
            [sessionID]: nextMessages[nextMessages.length - 1]?.id ?? "",
          },
          hydrated: {
            ...state.hydrated,
            [id]: true,
          },
          oldestCursor: {
            ...state.oldestCursor,
            [sessionID]: nextMessages[0]?.id ?? null,
          },
          sending: { ...state.sending, [sessionID]: true },
          sessionOrder,
        }

        return {
          ...next,
          ...trimStateForLRU(next, sessionID),
        }
      })

      try {
        const model = useSettings.getState().model ?? undefined
        await client().session.promptAsync({
          path: { id: sessionID },
          body: {
            parts: [{ type: "text", text: content }],
            model,
          },
        })
      } catch (error) {
        set((state) => {
          const nextMessages = (state.messages[sessionID] ?? []).filter((m) => m.id !== id)
          const nextParts = { ...state.parts }
          const nextPartIndex = { ...state.partIndexByMessage }
          const nextHydrated = { ...state.hydrated }
          const partsVersionBySession = { ...state.partsVersionBySession }
          delete nextParts[id]
          delete nextPartIndex[id]
          delete nextHydrated[id]
          incrementVersion(partsVersionBySession, sessionID)
          return {
            messages: { ...state.messages, [sessionID]: nextMessages },
            parts: nextParts,
            messageIndexBySession: {
              ...state.messageIndexBySession,
              [sessionID]: buildMessageIndex(nextMessages),
            },
            partIndexByMessage: nextPartIndex,
            partsVersionBySession,
            lastMessageIDBySession: {
              ...state.lastMessageIDBySession,
              [sessionID]: nextMessages[nextMessages.length - 1]?.id ?? "",
            },
            hydrated: nextHydrated,
            oldestCursor: {
              ...state.oldestCursor,
              [sessionID]: nextMessages[0]?.id ?? null,
            },
          }
        })
        throw new SendMessageError({ sessionID, content, originalError: error })
      } finally {
        set((state) => ({
          sending: { ...state.sending, [sessionID]: false },
        }))
      }
    },

    sendNew: async (content) => {
      telemetry.track("chat", "messages:sendNew", { length: content.length })
      const session = await useSessions.getState().create()
      try {
        await get().send(session.id, content)
        return session.id
      } catch (error) {
        const hasMessages = (get().messages[session.id]?.length ?? 0) > 0
        if (!hasMessages) {
          try {
            await useSessions.getState().delete(session.id)
          } catch {
            // best effort cleanup only
          }
        }
        throw error
      }
    },

    abort: async (sessionID) => {
      telemetry.track("chat", "messages:abort", { sessionID })
      try {
        await client().session.abort({ path: { id: sessionID } })
      } catch {
        // ignore
      }
    },

    _applyEvents: (events) => {
      if (events.length === 0) return

      const touchedSessions = new Set<string>()
      const touchedForPersist = new Set<string>()

      set((state) => {
        const messages = { ...state.messages }
        const parts = { ...state.parts }
        const messageIndexBySession = { ...state.messageIndexBySession }
        const partIndexByMessage = { ...state.partIndexByMessage }
        const partsVersionBySession = { ...state.partsVersionBySession }
        const lastMessageIDBySession = { ...state.lastMessageIDBySession }
        const hydrated = { ...state.hydrated }
        const oldestCursor = { ...state.oldestCursor }
        const loadedAt = { ...state.loadedAt }

        let changed = false

        for (const event of events) {
          switch (event.type) {
            case "message.updated": {
              const info = event.properties.info
              const sessionID = info.sessionID
              touchedSessions.add(sessionID)
              touchedForPersist.add(sessionID)

              const existing = messages[sessionID] ?? []
              const sessionIndex = messageIndexBySession[sessionID] ?? buildMessageIndex(existing)
              const idx = sessionIndex[info.id] ?? -1
              if (idx >= 0) {
                const next = [...existing]
                next[idx] = info
                messages[sessionID] = next
                messageIndexBySession[sessionID] = sessionIndex
              } else {
                const filtered = existing.filter(
                  (message) => !message.id.startsWith("optimistic-") || message.role !== info.role,
                )
                const insertAt = findMessageInsertIndex(filtered, info.id)
                const next = [...filtered.slice(0, insertAt), info, ...filtered.slice(insertAt)]
                messages[sessionID] = next
                messageIndexBySession[sessionID] = buildMessageIndex(next)
              }
              oldestCursor[sessionID] = messages[sessionID][0]?.id ?? null
              lastMessageIDBySession[sessionID] = messages[sessionID][messages[sessionID].length - 1]?.id ?? ""
              loadedAt[sessionID] = Date.now()
              changed = true
              break
            }

            case "message.removed": {
              const sessionID = event.properties.sessionID
              const messageID = event.properties.messageID
              touchedSessions.add(sessionID)
              touchedForPersist.add(sessionID)

              const existing = messages[sessionID] ?? []
              const sessionIndex = messageIndexBySession[sessionID] ?? buildMessageIndex(existing)
              const idx = sessionIndex[messageID] ?? -1
              const next =
                idx >= 0
                  ? [...existing.slice(0, idx), ...existing.slice(idx + 1)]
                  : existing.filter((message) => message.id !== messageID)
              messages[sessionID] = next
              messageIndexBySession[sessionID] = buildMessageIndex(next)
              delete parts[messageID]
              delete partIndexByMessage[messageID]
              delete hydrated[messageID]
              const removedPrefix = `${messageID}:`
              for (const key of pendingDeltas.keys()) {
                if (key.startsWith(removedPrefix)) {
                  pendingDeltas.delete(key)
                }
              }
              oldestCursor[sessionID] = next[0]?.id ?? null
              lastMessageIDBySession[sessionID] = next[next.length - 1]?.id ?? ""
              loadedAt[sessionID] = Date.now()
              changed = true
              break
            }

            case "message.part.updated": {
              const part = event.properties.part
              const sessionID = part.sessionID
              touchedSessions.add(sessionID)
              touchedForPersist.add(sessionID)

              let nextPart = part as Part
              const prefix = `${part.messageID}:${part.id}:`
              for (const [key, bufferedDelta] of pendingDeltas.entries()) {
                if (!key.startsWith(prefix)) continue
                const field = key.slice(prefix.length)
                nextPart = appendPartDelta(nextPart, field, bufferedDelta)
                if (field === "text" && (nextPart.type === "text" || nextPart.type === "reasoning")) {
                  markChatFirstToken(sessionID)
                }
                pendingDeltas.delete(key)
              }

              const existing = parts[part.messageID] ?? []
              const partIndex = partIndexByMessage[part.messageID] ?? buildPartIndex(existing)
              const idx = partIndex[nextPart.id] ?? -1
              if (idx >= 0) {
                const next = [...existing]
                next[idx] = nextPart
                parts[nextPart.messageID] = next
                partIndexByMessage[nextPart.messageID] = partIndex
                hydrated[nextPart.messageID] = isHydratedParts(next)
              } else {
                const next = [...existing, nextPart]
                parts[nextPart.messageID] = next
                partIndexByMessage[nextPart.messageID] = buildPartIndex(next)
                hydrated[nextPart.messageID] = isHydratedParts(next)
              }
              incrementVersion(partsVersionBySession, sessionID)
              loadedAt[sessionID] = Date.now()
              changed = true
              break
            }

            case "message.part.delta": {
              const { sessionID, messageID, partID, field, delta } = event.properties
              if (!delta) break

              const existing = parts[messageID] ?? []
              const partIndex = partIndexByMessage[messageID] ?? buildPartIndex(existing)
              const idx = partIndex[partID] ?? -1

              if (idx < 0) {
                const key = deltaBufferKey(messageID, partID, field)
                pendingDeltas.set(key, (pendingDeltas.get(key) ?? "") + delta)
                if (pendingDeltas.size > MAX_PENDING_DELTA_ENTRIES) {
                  // Keep map bounded in pathological out-of-order streams.
                  for (const pendingKey of pendingDeltas.keys()) {
                    pendingDeltas.delete(pendingKey)
                    if (pendingDeltas.size <= PENDING_DELTA_TRIM_TARGET) break
                  }
                }
                markStreamLateDelta(sessionID, messageID, partID, field)
                break
              }

              const currentPart = existing[idx]
              const nextPart = appendPartDelta(currentPart, field, delta)
              if (nextPart === currentPart) break

              touchedSessions.add(sessionID)
              touchedForPersist.add(sessionID)
              const next = [...existing]
              next[idx] = nextPart
              parts[messageID] = next
              partIndexByMessage[messageID] = partIndex
              hydrated[messageID] = isHydratedParts(next)
              loadedAt[sessionID] = Date.now()
              if (field === "text" && (nextPart.type === "text" || nextPart.type === "reasoning")) {
                markChatFirstToken(sessionID)
              }
              changed = true
              break
            }

            case "message.part.removed": {
              const sessionID = event.properties.sessionID
              const messageID = event.properties.messageID
              const partID = event.properties.partID
              touchedSessions.add(sessionID)
              touchedForPersist.add(sessionID)

              const existing = parts[messageID] ?? []
              const partIndex = partIndexByMessage[messageID] ?? buildPartIndex(existing)
              const idx = partIndex[partID] ?? -1
              const next =
                idx >= 0
                  ? [...existing.slice(0, idx), ...existing.slice(idx + 1)]
                  : existing.filter((part) => part.id !== partID)
              parts[messageID] = next
              partIndexByMessage[messageID] = buildPartIndex(next)
              hydrated[messageID] = isHydratedParts(next)
              const removedPrefix = `${messageID}:${partID}:`
              for (const key of pendingDeltas.keys()) {
                if (key.startsWith(removedPrefix)) {
                  pendingDeltas.delete(key)
                }
              }
              incrementVersion(partsVersionBySession, sessionID)
              loadedAt[sessionID] = Date.now()
              changed = true
              break
            }
          }
        }

        if (!changed) return {}

        let sessionOrder = state.sessionOrder
        for (const sessionID of touchedSessions) {
          sessionOrder = touchSessionOrder(sessionOrder, sessionID)
        }

        const next: MessageState = {
          ...state,
          messages,
          parts,
          messageIndexBySession,
          partIndexByMessage,
          partsVersionBySession,
          lastMessageIDBySession,
          hydrated,
          oldestCursor,
          loadedAt,
          sessionOrder,
        }

        const trimmed = next.sessionOrder.length > MAX_ACTIVE_SESSIONS ? trimStateForLRU(next) : null
        return trimmed ? { ...next, ...trimmed } : next
      })

      for (const sessionID of touchedForPersist) {
        schedulePersist(sessionID)
      }
    },

    _upsertMessage: (_sessionID, message) => {
      get()._applyEvents([
        {
          type: "message.updated",
          properties: { info: message },
        } as MessageEvent,
      ])
    },

    _removeMessage: (sessionID, messageID) => {
      get()._applyEvents([
        {
          type: "message.removed",
          properties: { sessionID, messageID },
        } as MessageEvent,
      ])
    },

    _upsertPart: (_messageID, part) => {
      get()._applyEvents([
        {
          type: "message.part.updated",
          properties: { part },
        } as MessageEvent,
      ])
    },

    _removePart: (messageID, partID) => {
      const sessionID = Object.entries(get().messageIndexBySession).find(([, index]) => messageID in index)?.[0]
      if (!sessionID) {
        set((state) => {
          const next = (state.parts[messageID] ?? []).filter((part) => part.id !== partID)
          const partIndexByMessage = { ...state.partIndexByMessage, [messageID]: buildPartIndex(next) }
          return {
            parts: { ...state.parts, [messageID]: next },
            partIndexByMessage,
            hydrated: { ...state.hydrated, [messageID]: isHydratedParts(next) },
          }
        })
        return
      }
      get()._applyEvents([
        {
          type: "message.part.removed",
          properties: {
            sessionID,
            messageID,
            partID,
          },
        } as MessageEvent,
      ])
    },
  }
})
