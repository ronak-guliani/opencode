import { create as createStore } from "zustand"
import { createOpencodeClient } from "@opencode-ai/sdk/client"
import type { Project, Session, SessionStatus } from "@opencode-ai/sdk/client"
import { client, url, headers } from "../api/client"
import { addCrashBreadcrumb } from "../perf/crash-breadcrumbs"
import { telemetry } from "../perf/telemetry"

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
  sessionByID: Record<string, Session>
  statuses: Record<string, SessionStatus>
  current: string | null
  loading: boolean
  reset: () => void
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
  sessionByID: {},
  statuses: {},
  current: null,
  loading: false,

  reset: () =>
    set({
      projects: [],
      sessions: [],
      sessionByID: {},
      statuses: {},
      current: null,
      loading: false,
    }),

  select: (id) => {
    telemetry.track("session", "session:select", { sessionID: id })
    set({ current: id })
  },

  fetch: async () => {
    const s = telemetry.span("session", "session:fetch")
    const startAt = Date.now()
    addCrashBreadcrumb("sessions-fetch:start")
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
      const deduped: Session[] = []
      const sessionByID: Record<string, Session> = {}
      const seen = new Set<string>()
      for (const session of sorted) {
        if (seen.has(session.id)) continue
        seen.add(session.id)
        deduped.push(session)
        sessionByID[session.id] = session
      }
      set({ projects, sessions: deduped, sessionByID, loading: false })
      s.end({ projects: projects.length, sessions: deduped.length })
      addCrashBreadcrumb("sessions-fetch:done", {
        projects: projects.length,
        sessions: deduped.length,
        elapsedMs: Date.now() - startAt,
      })
    } catch {
      set({ loading: false })
      s.end({ error: true })
      addCrashBreadcrumb(
        "sessions-fetch:error",
        {
          elapsedMs: Date.now() - startAt,
        },
        "warn",
      )
    }
  },

  fetchStatuses: async () => {
    const startAt = Date.now()
    addCrashBreadcrumb("sessions-status:start")
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
      const merged: Record<string, SessionStatus> = {}
      for (const item of statuses) {
        if (!item) continue
        Object.assign(merged, item)
      }
      set({ statuses: merged })
      addCrashBreadcrumb("sessions-status:done", {
        projects: projects.length,
        statuses: Object.keys(merged).length,
        elapsedMs: Date.now() - startAt,
      })
    } catch {
      // ignore
      addCrashBreadcrumb(
        "sessions-status:error",
        {
          elapsedMs: Date.now() - startAt,
        },
        "warn",
      )
    }
  },

  create: async () => {
    const s = telemetry.span("session", "session:create")
    const result = await client().session.create()
    if (!result.data) throw new Error("Failed to create session")
    get()._upsert(result.data)
    set({ current: result.data.id })
    s.end({ sessionID: result.data.id })
    return result.data
  },

  archive: async (id) => {
    telemetry.track("session", "session:archive", { sessionID: id })
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
    telemetry.track("session", "session:delete", { sessionID: id })
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
      return {
        sessions: [session, ...without].sort((a, b) => b.time.updated - a.time.updated),
        sessionByID: { ...state.sessionByID, [session.id]: session },
      }
    })
  },

  _remove: (id) => {
    set((state) => {
      const nextStatuses = { ...state.statuses }
      const nextByID = { ...state.sessionByID }
      delete nextStatuses[id]
      delete nextByID[id]
      return {
        sessions: state.sessions.filter((s) => s.id !== id),
        sessionByID: nextByID,
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
