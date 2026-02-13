import { create as createStore } from "zustand"
import type { Session, SessionStatus } from "@opencode-ai/sdk/client"
import { client } from "../api/client"
type SessionState = {
  sessions: Session[]
  statuses: Record<string, SessionStatus>
  current: string | null
  loading: boolean
  select: (id: string | null) => void
  fetch: () => Promise<void>
  fetchStatuses: () => Promise<void>
  create: () => Promise<Session>
  archive: (id: string) => Promise<void>
  reset: () => void
  _upsert: (session: Session) => void
  _remove: (id: string) => void
  _setStatus: (id: string, status: SessionStatus) => void
}

export const useSessions = createStore<SessionState>((set, get) => ({
  sessions: [],
  statuses: {},
  current: null,
  loading: false,

  select: (id) => set({ current: id }),

  fetch: async () => {
    set({ loading: true })
    try {
      const result = await client().session.list()
      if (!result.data) return
      const sorted = [...result.data].sort((a, b) => b.time.updated - a.time.updated)
      set({ sessions: sorted, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  fetchStatuses: async () => {
    try {
      const result = await client().session.status()
      if (!result.data) return
      set({ statuses: result.data as Record<string, SessionStatus> })
    } catch {
      // ignore
    }
  },

  create: async () => {
    const result = await client().session.create()
    if (!result.data) throw new Error("Failed to create session")
    get()._upsert(result.data)
    set({ current: result.data.id })
    return result.data
  },

  archive: async (id) => {
    await client().session.delete({ path: { id } })
    get()._remove(id)
    if (get().current === id) {
      set({ current: null })
    }
  },

  reset: () =>
    set({
      sessions: [],
      statuses: {},
      current: null,
      loading: false,
    }),

  _upsert: (session) => {
    set((state) => {
      const existing = state.sessions.find((s) => s.id === session.id)
      const without = existing ? state.sessions.filter((s) => s.id !== session.id) : state.sessions
      return { sessions: [session, ...without].sort((a, b) => b.time.updated - a.time.updated) }
    })
  },

  _remove: (id) => {
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
    }))
  },

  _setStatus: (id, status) => {
    set((state) => ({
      statuses: { ...state.statuses, [id]: status },
    }))
  },
}))
