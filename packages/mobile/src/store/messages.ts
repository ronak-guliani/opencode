import AsyncStorage from "@react-native-async-storage/async-storage"
import { create as createStore } from "zustand"
import type { Event, Message, Part } from "@opencode-ai/sdk/client"
import { client } from "../api/client"
import { useSessions } from "./sessions"
import { useSettings } from "./settings"

type MessageEvent =
  | Extract<Event, { type: "message.updated" }>
  | Extract<Event, { type: "message.removed" }>
  | Extract<Event, { type: "message.part.updated" }>
  | Extract<Event, { type: "message.part.removed" }>

type MessageState = {
  messages: Record<string, Message[]>
  parts: Record<string, Part[]>
  sending: Record<string, boolean>
  loading: Record<string, boolean>
  prefetching: Record<string, boolean>
  hydrating: Record<string, boolean>
  loadedAt: Record<string, number>
  exhausted: Record<string, boolean>
  oldestCursor: Record<string, string | null>
  hydrated: Record<string, boolean>
  sessionOrder: string[]
  load: (sessionID: string, opts?: { force?: boolean; limit?: number; compact?: boolean }) => Promise<void>
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

const MESSAGE_CACHE_TTL_MS = 30_000
const PERSISTED_CACHE_TTL_MS = 5 * 60_000
const INITIAL_MESSAGE_LIMIT = 60
const LOAD_MORE_STEP = 60
const PREFETCH_LIMIT = 20
const MAX_MESSAGE_LIMIT = 5_000
const MAX_ACTIVE_SESSIONS = 6
const MAX_PERSISTED_SESSIONS = 12
const CACHE_KEY_PREFIX = "opencode-mobile:chat-cache:v2:"
const CACHE_INDEX_KEY = `${CACHE_KEY_PREFIX}index`

const persistTimers = new Map<string, ReturnType<typeof setTimeout>>()

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

function cacheKey(sessionID: string) {
  return `${CACHE_KEY_PREFIX}${sessionID}`
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
    const raw = await AsyncStorage.getItem(CACHE_INDEX_KEY)
    const prev = raw ? ((JSON.parse(raw) as { order?: string[] }).order ?? []) : []
    const order = [sessionID, ...prev.filter((id) => id !== sessionID)]
    const evicted = order.slice(MAX_PERSISTED_SESSIONS)
    const keep = order.slice(0, MAX_PERSISTED_SESSIONS)
    await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify({ order: keep }))
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
      delete hydrated[message.id]
      delete hydrating[message.id]
    }
    delete messages[sessionID]
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
  const byID = new Map<string, Message>()
  for (const message of incoming) {
    byID.set(message.id, message)
  }
  for (const message of existing) {
    byID.set(message.id, message)
  }
  return Array.from(byID.values()).sort(sortMessages)
}

export const useMessages = createStore<MessageState>((set, get) => {
  const schedulePersist = (sessionID: string) => {
    const existing = persistTimers.get(sessionID)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      persistTimers.delete(sessionID)
      const state = get()
      const sessionMessages = state.messages[sessionID] ?? []
      if (sessionMessages.length === 0) return

      const payload: CachedSession = {
        savedAt: Date.now(),
        oldestCursor: state.oldestCursor[sessionID] ?? sessionMessages[0]?.id ?? null,
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
    }, 250)

    persistTimers.set(sessionID, timer)
  }

  const applyLoadedEntries = (sessionID: string, entries: MessageWithParts[], limit: number, loadedAt: number) => {
    set((state) => {
      const messages = entries.map((entry) => entry.info)
      const nextIDs = new Set(messages.map((message) => message.id))
      const previousMessages = state.messages[sessionID] ?? []
      const parts = { ...state.parts }
      const hydrated = { ...state.hydrated }

      for (const message of previousMessages) {
        if (nextIDs.has(message.id)) continue
        delete parts[message.id]
        delete hydrated[message.id]
      }

      for (const entry of entries) {
        parts[entry.info.id] = entry.parts
        hydrated[entry.info.id] = isHydratedParts(entry.parts)
      }

      const sessionOrder = touchSessionOrder(state.sessionOrder, sessionID)
      const next: MessageState = {
        ...state,
        messages: { ...state.messages, [sessionID]: messages },
        parts,
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
  }

  return {
    messages: {},
    parts: {},
    sending: {},
    loading: {},
    prefetching: {},
    hydrating: {},
    loadedAt: {},
    exhausted: {},
    oldestCursor: {},
    hydrated: {},
    sessionOrder: [],

    load: async (sessionID, opts) => {
      const state = get()
      if (state.loading[sessionID]) return

      const limit = Math.max(1, Math.min(opts?.limit ?? INITIAL_MESSAGE_LIMIT, MAX_MESSAGE_LIMIT))
      const now = Date.now()
      const hasMessages = (state.messages[sessionID]?.length ?? 0) > 0
      const loadedAt = state.loadedAt[sessionID]

      if (!opts?.force && hasMessages && loadedAt && now - loadedAt < MESSAGE_CACHE_TTL_MS) {
        set((prev) => ({
          sessionOrder: touchSessionOrder(prev.sessionOrder, sessionID),
        }))
        return
      }

      if (!hasMessages && !opts?.force) {
        const cached = await readCachedSession(sessionID)
        if (cached && cached.entries.length > 0) {
          const cacheAge = now - cached.savedAt
          applyLoadedEntries(sessionID, cached.entries, limit, cached.savedAt)
          if (cacheAge < PERSISTED_CACHE_TTL_MS) {
            return
          }
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
            compact: opts?.compact ?? true,
          },
        })
        const elapsed = (globalThis.performance?.now?.() ?? Date.now()) - requestStart

        if (result.data) {
          const entries = result.data as MessageWithParts[]
          applyLoadedEntries(sessionID, entries, limit, Date.now())
          schedulePersist(sessionID)
          if (__DEV__) {
            const bytes = JSON.stringify(result.data).length
            console.log(`[chat-load] ${sessionID} limit=${limit} time=${elapsed.toFixed(1)}ms bytes=${bytes}`)
          }
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

    loadMore: async (sessionID) => {
      const state = get()
      if (state.loading[sessionID] || state.exhausted[sessionID]) return

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
            const hydrated = { ...prev.hydrated }
            for (const entry of entries) {
              const messageID = entry.info.id
              if (prev.hydrated[messageID] && prev.parts[messageID]) continue
              parts[messageID] = entry.parts
              hydrated[messageID] = isHydratedParts(entry.parts)
            }

            const sessionOrder = touchSessionOrder(prev.sessionOrder, sessionID)
            const next: MessageState = {
              ...prev,
              messages: { ...prev.messages, [sessionID]: mergedMessages },
              parts,
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
          await get().load(sessionID, { limit, compact: true })
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
            const idx = existing.findIndex((message) => message.id === messageID)
            const nextMessages = [...existing]
            if (idx >= 0) {
              nextMessages[idx] = entry.info
            } else {
              nextMessages.push(entry.info)
              nextMessages.sort(sortMessages)
            }

            const sessionOrder = touchSessionOrder(prev.sessionOrder, sessionID)
            const next: MessageState = {
              ...prev,
              messages: { ...prev.messages, [sessionID]: nextMessages },
              parts: { ...prev.parts, [messageID]: entry.parts },
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
          const nextHydrated = { ...state.hydrated }
          delete nextParts[id]
          delete nextHydrated[id]
          return {
            messages: { ...state.messages, [sessionID]: nextMessages },
            parts: nextParts,
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
              const idx = existing.findIndex((message) => message.id === info.id)
              if (idx >= 0) {
                const next = [...existing]
                next[idx] = info
                messages[sessionID] = next.sort(sortMessages)
              } else {
                const filtered = existing.filter(
                  (message) => !message.id.startsWith("optimistic-") || message.role !== info.role,
                )
                messages[sessionID] = [...filtered, info].sort(sortMessages)
              }
              oldestCursor[sessionID] = messages[sessionID][0]?.id ?? null
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
              const next = existing.filter((message) => message.id !== messageID)
              messages[sessionID] = next
              delete parts[messageID]
              delete hydrated[messageID]
              oldestCursor[sessionID] = next[0]?.id ?? null
              loadedAt[sessionID] = Date.now()
              changed = true
              break
            }

            case "message.part.updated": {
              const part = event.properties.part
              const sessionID = part.sessionID
              touchedSessions.add(sessionID)
              touchedForPersist.add(sessionID)

              const existing = parts[part.messageID] ?? []
              const idx = existing.findIndex((candidate) => candidate.id === part.id)
              if (idx >= 0) {
                const next = [...existing]
                next[idx] = part
                parts[part.messageID] = next
                hydrated[part.messageID] = isHydratedParts(next)
              } else {
                const next = [...existing, part]
                parts[part.messageID] = next
                hydrated[part.messageID] = isHydratedParts(next)
              }
              loadedAt[sessionID] = Date.now()
              changed = true
              break
            }

            case "message.part.removed": {
              const sessionID = event.properties.sessionID
              const messageID = event.properties.messageID
              touchedSessions.add(sessionID)
              touchedForPersist.add(sessionID)

              const existing = parts[messageID] ?? []
              const next = existing.filter((part) => part.id !== event.properties.partID)
              parts[messageID] = next
              hydrated[messageID] = isHydratedParts(next)
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
          hydrated,
          oldestCursor,
          loadedAt,
          sessionOrder,
        }

        return {
          ...next,
          ...trimStateForLRU(next),
        }
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
      const sessionID = Object.entries(get().messages).find(([, sessionMessages]) =>
        sessionMessages.some((message) => message.id === messageID),
      )?.[0]
      if (!sessionID) {
        set((state) => {
          const next = (state.parts[messageID] ?? []).filter((part) => part.id !== partID)
          return {
            parts: { ...state.parts, [messageID]: next },
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
