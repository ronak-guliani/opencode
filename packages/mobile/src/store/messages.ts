import { create } from "zustand"
import type { Message, Part } from "@opencode-ai/sdk/client"
import * as Binary from "@/util/binary"

interface MessageState {
  /** Messages per session, sorted by ID */
  messages: Record<string, Message[]>
  /** Parts per message, sorted by ID */
  parts: Record<string, Part[]>
}

interface MessageActions {
  setMessages: (sessionId: string, messages: Message[], parts: Record<string, Part[]>) => void
  clear: (sessionId: string) => void

  /** Event reducer actions — called by the SSE event handler */
  upsertMessage: (sessionId: string, message: Message) => void
  removeMessage: (sessionId: string, messageId: string) => void
  upsertPart: (messageId: string, part: Part) => void
  removePart: (messageId: string, partId: string) => void
}

type MessageStore = MessageState & MessageActions

const messageKey = (m: Message) => m.id
const partKey = (p: Part) => p.id

/**
 * Message store holds messages and their parts, keyed by session and message ID.
 *
 * Both messages and parts arrays are sorted by ID for binary search insertion
 * during SSE event processing. This prevents full-array scans on every streaming
 * update — critical for performance with rapid message.part.updated events.
 */
export const useMessageStore = create<MessageStore>((set) => ({
  messages: {},
  parts: {},

  setMessages: (sessionId, messages, parts) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [sessionId]: messages.toSorted((a, b) => (a.id < b.id ? -1 : 1)),
      },
      parts: { ...state.parts, ...parts },
    })),

  clear: (sessionId) =>
    set((state) => {
      const msgs = state.messages[sessionId]
      if (!msgs) return state
      const next = { ...state.parts }
      for (const m of msgs) {
        delete next[m.id]
      }
      const messages = { ...state.messages }
      delete messages[sessionId]
      return { messages, parts: next }
    }),

  upsertMessage: (sessionId, message) =>
    set((state) => {
      const existing = state.messages[sessionId] ?? []
      return {
        messages: {
          ...state.messages,
          [sessionId]: Binary.insert(existing, message, messageKey),
        },
      }
    }),

  removeMessage: (sessionId, messageId) =>
    set((state) => {
      const existing = state.messages[sessionId]
      if (!existing) return state
      const next = { ...state.parts }
      delete next[messageId]
      return {
        messages: {
          ...state.messages,
          [sessionId]: Binary.remove(existing, messageId, messageKey),
        },
        parts: next,
      }
    }),

  upsertPart: (messageId, part) =>
    set((state) => {
      const existing = state.parts[messageId] ?? []
      return {
        parts: {
          ...state.parts,
          [messageId]: Binary.insert(existing, part, partKey),
        },
      }
    }),

  removePart: (messageId, partId) =>
    set((state) => {
      const existing = state.parts[messageId]
      if (!existing) return state
      return {
        parts: {
          ...state.parts,
          [messageId]: Binary.remove(existing, partId, partKey),
        },
      }
    }),
}))
