import { create } from "zustand"
import type { Session, SessionStatus } from "@opencode-ai/sdk/client"
import * as Binary from "@/util/binary"

interface SessionState {
  sessions: Session[]
  statuses: Record<string, SessionStatus>
  current: string | null
  total: number
}

interface SessionActions {
  select: (id: string | null) => void
  setSessions: (sessions: Session[], total: number) => void
  setStatuses: (statuses: Record<string, SessionStatus>) => void

  /** Event reducer actions — called by the SSE event handler, not directly by UI */
  upsert: (session: Session) => void
  remove: (id: string) => void
  setStatus: (id: string, status: SessionStatus) => void
}

type SessionStore = SessionState & SessionActions

const key = (s: Session) => s.id

/**
 * Session store holds the sorted list of sessions, their statuses,
 * and which session is currently selected.
 *
 * Sessions are sorted by ID (ULID, which is time-ordered) for O(log n)
 * lookups via binary search. This mirrors the web app's approach.
 */
export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  statuses: {},
  current: null,
  total: 0,

  select: (id) => set({ current: id }),

  setSessions: (sessions, total) => set({ sessions: sessions.toSorted((a, b) => (a.id < b.id ? -1 : 1)), total }),

  setStatuses: (statuses) => set({ statuses }),

  upsert: (session) =>
    set((state) => ({
      sessions: Binary.insert(state.sessions, session, key),
      total: Binary.search(state.sessions, session.id, key).found ? state.total : state.total + 1,
    })),

  remove: (id) =>
    set((state) => {
      const result = Binary.search(state.sessions, id, key)
      if (!result.found) return state
      return {
        sessions: Binary.remove(state.sessions, id, key),
        current: state.current === id ? null : state.current,
        total: state.total - 1,
      }
    }),

  setStatus: (id, status) =>
    set((state) => ({
      statuses: { ...state.statuses, [id]: status },
    })),
}))
