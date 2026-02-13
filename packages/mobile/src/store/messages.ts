import { create as createStore } from "zustand"
import type { Message, Part } from "@opencode-ai/sdk/client"
import { client } from "../api/client"
import { useSessions } from "./sessions"
import { useSettings } from "./settings"

type MessageState = {
  messages: Record<string, Message[]>
  parts: Record<string, Part[]>
  sending: Record<string, boolean>
  load: (sessionID: string) => Promise<void>
  send: (sessionID: string, content: string) => Promise<void>
  sendNew: (content: string) => Promise<string>
  abort: (sessionID: string) => Promise<void>
  _upsertMessage: (sessionID: string, message: Message) => void
  _removeMessage: (sessionID: string, messageID: string) => void
  _upsertPart: (messageID: string, part: Part) => void
  _removePart: (messageID: string, partID: string) => void
}

export const useMessages = createStore<MessageState>((set, get) => ({
  messages: {},
  parts: {},
  sending: {},

  load: async (sessionID) => {
    try {
      const result = await client().session.messages({ path: { id: sessionID } })
      if (!result.data) return
      const msgs = result.data as Array<{ info: Message; parts: Part[] }>
      const messages: Message[] = []
      const parts: Record<string, Part[]> = { ...get().parts }
      for (const entry of msgs) {
        messages.push(entry.info)
        parts[entry.info.id] = entry.parts
      }
      set((state) => ({
        messages: { ...state.messages, [sessionID]: messages },
        parts,
      }))
    } catch {
      // ignore
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

    set((state) => ({
      messages: {
        ...state.messages,
        [sessionID]: [...(state.messages[sessionID] ?? []), optimisticUser],
      },
      parts: {
        ...state.parts,
        [id]: [optimisticPart],
      },
      sending: { ...state.sending, [sessionID]: true },
    }))

    try {
      const model = useSettings.getState().model ?? undefined
      await client().session.promptAsync({
        path: { id: sessionID },
        body: {
          parts: [{ type: "text", text: content }],
          model,
        },
      })
    } catch {
      // SSE events will handle actual message updates
    } finally {
      set((state) => ({
        sending: { ...state.sending, [sessionID]: false },
      }))
    }
  },

  sendNew: async (content) => {
    const session = await useSessions.getState().create()
    await get().send(session.id, content)
    return session.id
  },

  abort: async (sessionID) => {
    try {
      await client().session.abort({ path: { id: sessionID } })
    } catch {
      // ignore
    }
  },

  _upsertMessage: (sessionID, message) => {
    set((state) => {
      const existing = state.messages[sessionID] ?? []
      const idx = existing.findIndex((m) => m.id === message.id)
      if (idx >= 0) {
        const next = [...existing]
        next[idx] = message
        return { messages: { ...state.messages, [sessionID]: next } }
      }
      // Remove optimistic messages when real ones arrive
      const filtered = existing.filter((m) => !m.id.startsWith("optimistic-") || m.role !== message.role)
      return { messages: { ...state.messages, [sessionID]: [...filtered, message] } }
    })
  },

  _removeMessage: (sessionID, messageID) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [sessionID]: (state.messages[sessionID] ?? []).filter((m) => m.id !== messageID),
      },
    }))
  },

  _upsertPart: (messageID, part) => {
    set((state) => {
      const existing = state.parts[messageID] ?? []
      const idx = existing.findIndex((p) => p.id === part.id)
      if (idx >= 0) {
        const next = [...existing]
        next[idx] = part
        return { parts: { ...state.parts, [messageID]: next } }
      }
      return { parts: { ...state.parts, [messageID]: [...existing, part] } }
    })
  },

  _removePart: (messageID, partID) => {
    set((state) => ({
      parts: {
        ...state.parts,
        [messageID]: (state.parts[messageID] ?? []).filter((p) => p.id !== partID),
      },
    }))
  },
}))
