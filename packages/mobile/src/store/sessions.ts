import { create as createStore } from "zustand"
import { createOpencodeClient } from "@opencode-ai/sdk/client"
import type { Project, Session, SessionStatus } from "@opencode-ai/sdk/client"
import { client, url, headers } from "../api/client"

function projectClient(worktree: string) {
  const base = headers()
  const nextHeaders: Record<string, string> = {
    ...base,
    "x-opencode-directory": worktree,
  }
  return createOpencodeClient({
    baseUrl: url(),
    headers: nextHeaders,
  })
}

async function listSessionsByProject(project: Project): Promise<Session[]> {
  const result = await projectClient(project.worktree).session.list()
  return result.data ?? []
}

async function listStatusesByProject(project: Project): Promise<Record<string, SessionStatus> | undefined> {
  const result = await projectClient(project.worktree).session.status()
  return result.data as Record<string, SessionStatus> | undefined
}
type SessionState = {
  projects: Project[]
  sessions: Session[]
  statuses: Record<string, SessionStatus>
  current: string | null
  loading: boolean
  select: (id: string | null) => void
  fetch: () => Promise<void>
  fetchStatuses: () => Promise<void>
  create: () => Promise<Session>
  archive: (id: string) => Promise<void>
  delete: (id: string) => Promise<void>
  _upsert: (session: Session) => void
  _remove: (id: string) => void
  _setStatus: (id: string, status: SessionStatus) => void
}

export const useSessions = createStore<SessionState>((set, get) => ({
  projects: [],
  sessions: [],
  statuses: {},
  current: null,
  loading: false,

  select: (id) => set({ current: id }),

  fetch: async () => {
    set({ loading: true })
    try {
      const projectsResult = await client().project.list()
      const projects = projectsResult.data ?? []
      const groups = await Promise.all(
        projects.map(async (project) => {
          try {
            return await listSessionsByProject(project)
          } catch {
            return []
          }
        }),
      )
      const sorted = groups.flat().sort((a, b) => b.time.updated - a.time.updated)
      set({ projects, sessions: sorted, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  fetchStatuses: async () => {
    try {
      const projects = get().projects.length ? get().projects : ((await client().project.list()).data ?? [])
      const statuses = await Promise.all(
        projects.map(async (project) => {
          try {
            return await listStatusesByProject(project)
          } catch {
            return undefined
          }
        }),
      )
      const merged = statuses.reduce<Record<string, SessionStatus>>((acc, item) => {
        if (!item) return acc
        return { ...acc, ...item }
      }, {})
      set({ statuses: merged })
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
    try {
      await client().session.update({
        path: { id },
        body: {
          // OpenAPI schema is stale; server accepts archival timestamp.
          time: { archived: Date.now() },
        } as unknown as { title?: string },
      })
    } catch {
      // Fallback for older server/schema mismatches.
      await client().session.delete({ path: { id } })
    }
    get()._remove(id)
    if (get().current === id) {
      set({ current: null })
    }
  },

  delete: async (id) => {
    await client().session.delete({ path: { id } })
    get()._remove(id)
    if (get().current === id) {
      set({ current: null })
    }
  },

  _upsert: (session) => {
    set((state) => {
      const existing = state.sessions.find((s) => s.id === session.id)
      const without = existing ? state.sessions.filter((s) => s.id !== session.id) : state.sessions
      return { sessions: [session, ...without].sort((a, b) => b.time.updated - a.time.updated) }
    })
  },

  _remove: (id) => {
    set((state) => {
      const nextStatuses = { ...state.statuses }
      delete nextStatuses[id]
      return {
        sessions: state.sessions.filter((s) => s.id !== id),
        statuses: nextStatuses,
        current: state.current === id ? null : state.current,
      }
    })
  },

  _setStatus: (id, status) => {
    set((state) => ({
      statuses: { ...state.statuses, [id]: status },
    }))
  },
}))
