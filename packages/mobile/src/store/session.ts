import { create } from "zustand"

export type Session = {
  id: string
  title: string
  time: {
    created: number
    updated: number
  }
}

export type MessageStatus = "sending" | "sent" | "failed"

export type Message = {
  id: string
  sessionID: string
  role: "user" | "assistant"
  content: string
  reasoning?: string
  time: number
  isComplete?: boolean
  status?: MessageStatus
  modelID?: string
  providerID?: string
}

type SessionState = {
  currentSession: Session | null
  sessions: Session[]
  messages: Message[]
  messageIds: Set<string>
  messageCache: Map<string, Message[]>
  isWaitingForResponse: boolean
  thinkingText: string | null
  setCurrentSession: (session: Session | null) => void
  setSessions: (sessions: Session[]) => void
  setMessages: (messages: Message[]) => void
  upsertMessage: (message: Message) => void
  updateMessageContent: (id: string, content: string) => void
  updateMessageReasoning: (id: string, reasoning: string) => void
  updateMessageStatus: (id: string, status: MessageStatus) => void
  markMessageComplete: (id: string) => void
  removeMessage: (id: string) => void
  setWaitingForResponse: (waiting: boolean) => void
  setThinkingText: (text: string | null) => void
  clearMessages: () => void
  cacheMessages: (sessionId: string, messages: Message[]) => void
  getCachedMessages: (sessionId: string) => Message[] | undefined
  prefetchSession: (sessionId: string) => void
  getLastModel: () => { providerID: string; modelID: string } | null
}

export const useSessionStore = create<SessionState>((set, get) => ({
  currentSession: null,
  sessions: [],
  messages: [],
  messageIds: new Set(),
  messageCache: new Map(),
  isWaitingForResponse: false,
  thinkingText: null,

  setCurrentSession: (session) => set({ currentSession: session }),
  setSessions: (sessions) => set({ sessions }),

  setMessages: (messages) => {
    const mapped = messages.map((m) => ({ ...m, isComplete: true }))
    const ids = new Set(mapped.map((m) => m.id))
    set({ messages: mapped, messageIds: ids })
    const session = get().currentSession
    if (session) {
      get().cacheMessages(session.id, mapped)
    }
  },

  upsertMessage: (message) => {
    if (!get().messageIds.has(message.id)) {
      set((state) => ({
        messages: [...state.messages, message],
        messageIds: new Set([...state.messageIds, message.id]),
      }))
    }
  },

  updateMessageContent: (id, content) => {
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === id)
      if (idx === -1) return state
      const updated = [...state.messages]
      updated[idx] = { ...updated[idx], content }
      return { messages: updated }
    })
  },

  updateMessageReasoning: (id, reasoning) => {
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === id)
      if (idx === -1) return state
      const updated = [...state.messages]
      updated[idx] = { ...updated[idx], reasoning }
      return { messages: updated }
    })
  },

  markMessageComplete: (id) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, isComplete: true, status: "sent" as MessageStatus } : m,
      ),
    }))
  },

  updateMessageStatus: (id, status) => {
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, status } : m)),
    }))
  },

  removeMessage: (id) => {
    set((state) => {
      const newIds = new Set(state.messageIds)
      newIds.delete(id)
      return {
        messages: state.messages.filter((m) => m.id !== id),
        messageIds: newIds,
      }
    })
  },

  setWaitingForResponse: (waiting) =>
    set({ isWaitingForResponse: waiting, thinkingText: waiting ? get().thinkingText : null }),

  setThinkingText: (text) => set({ thinkingText: text }),

  clearMessages: () => set({ messages: [], messageIds: new Set(), isWaitingForResponse: false, thinkingText: null }),

  cacheMessages: (sessionId, messages) => {
    const cache = new Map(get().messageCache)
    cache.set(sessionId, messages)
    if (cache.size > 20) {
      const first = cache.keys().next().value
      if (first) cache.delete(first)
    }
    set({ messageCache: cache })
  },

  getCachedMessages: (sessionId) => {
    return get().messageCache.get(sessionId)
  },

  prefetchSession: (sessionId) => {
    const cached = get().messageCache.get(sessionId)
    if (cached) {
      set({ messages: cached })
    }
  },

  getLastModel: () => {
    const messages = get().messages
    if (messages.length === 0) return null

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.modelID && msg.providerID) {
        return {
          providerID: msg.providerID,
          modelID: msg.modelID,
        }
      }
    }
    return null
  },
}))
