import { create as createStore } from "zustand"
import { createOpencodeClient } from "@opencode-ai/sdk/client"
import { client } from "../api/client"
import { headers, url } from "../api/client"
import type { DiffSummary, SessionFileDiff } from "../features/diff/types"
import { useSessions } from "./sessions"

const DIFF_CACHE_TTL_MS = 30_000

const EMPTY_SUMMARY: DiffSummary = {
  files: 0,
  additions: 0,
  deletions: 0,
}

function numberOrZero(input: unknown): number {
  return Number.isFinite(input) ? Number(input) : 0
}

function stringOrEmpty(input: unknown): string {
  return typeof input === "string" ? input : ""
}

function resolveFilePath(diff: Record<string, unknown>): string {
  const candidates = [
    diff.file,
    diff.path,
    diff.filePath,
    diff.filepath,
    diff.relativePath,
    diff.filename,
    diff.name,
  ]
  for (const candidate of candidates) {
    const value = stringOrEmpty(candidate).trim()
    if (value) return value
  }
  return ""
}

function normalizeDiff(input: unknown): SessionFileDiff | null {
  const diff = (input && typeof input === "object" ? input : {}) as Partial<SessionFileDiff>
  const file = resolveFilePath(diff as Record<string, unknown>)
  if (!file) return null
  return {
    file,
    before: stringOrEmpty(diff.before),
    after: stringOrEmpty(diff.after),
    additions: Math.max(0, numberOrZero(diff.additions)),
    deletions: Math.max(0, numberOrZero(diff.deletions)),
    status:
      typeof diff.status === "string"
        ? diff.status
        : typeof (diff as { type?: unknown }).type === "string"
          ? (diff as { type: string }).type
          : undefined,
  }
}

function normalizeDiffList(diff: unknown): SessionFileDiff[] {
  if (!Array.isArray(diff)) return []
  return diff.map(normalizeDiff).filter((item): item is SessionFileDiff => !!item)
}

function mergeDiffs(input: SessionFileDiff[]): SessionFileDiff[] {
  const byFile = new Map<string, SessionFileDiff>()
  for (const item of input) {
    const file = stringOrEmpty(item.file)
    if (!file) continue
    const previous = byFile.get(file)
    if (!previous) {
      byFile.set(file, item)
      continue
    }
    byFile.set(file, {
      file,
      before: item.before || previous.before,
      after: item.after || previous.after,
      additions: Math.max(previous.additions, item.additions),
      deletions: Math.max(previous.deletions, item.deletions),
      status: item.status ?? previous.status,
    })
  }
  return [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file))
}

async function fetchDiffFromWorktree(sessionID: string, worktree: string | undefined) {
  if (!worktree) {
    const result = await client().session.diff({
      path: { id: sessionID },
    })
    return normalizeDiffList(result.data as SessionFileDiff[] | undefined)
  }
  const nextHeaders: Record<string, string> = {
    ...headers(),
    "x-opencode-directory": worktree,
  }
  const scopedClient = createOpencodeClient({
    baseUrl: url(),
    headers: nextHeaders,
  })
  const result = await scopedClient.session.diff({
    path: { id: sessionID },
  })
  return normalizeDiffList(result.data as SessionFileDiff[] | undefined)
}

async function fetchDiffForSession(sessionID: string) {
  const sessionWorktree = useSessions.getState().sessions.find((item) => item.id === sessionID)?.directory
  if (sessionWorktree) {
    try {
      return mergeDiffs(await fetchDiffFromWorktree(sessionID, sessionWorktree))
    } catch {
      // fallback below
    }
  }

  const currentWorktree = headers()["x-opencode-directory"]
  return mergeDiffs(await fetchDiffFromWorktree(sessionID, currentWorktree || undefined))
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return "Could not load session diff."
}

export function computeSummary(diff: SessionFileDiff[]): DiffSummary {
  if (!Array.isArray(diff) || diff.length === 0) return EMPTY_SUMMARY
  return diff.reduce<DiffSummary>(
    (acc, entry) => ({
      files: acc.files + 1,
      additions: acc.additions + Math.max(0, numberOrZero(entry.additions)),
      deletions: acc.deletions + Math.max(0, numberOrZero(entry.deletions)),
    }),
    { files: 0, additions: 0, deletions: 0 },
  )
}

type DiffState = {
  bySession: Record<string, SessionFileDiff[]>
  loading: Record<string, boolean>
  error: Record<string, string | null>
  fetchedAt: Record<string, number>
  reset: () => void
  fetchSessionDiff: (sessionID: string, opts?: { force?: boolean }) => Promise<void>
  setSessionDiff: (sessionID: string, diff: SessionFileDiff[]) => void
  invalidate: (sessionID: string) => void
}

export const useDiffs = createStore<DiffState>((set, get) => ({
  bySession: {},
  loading: {},
  error: {},
  fetchedAt: {},

  reset: () =>
    set({
      bySession: {},
      loading: {},
      error: {},
      fetchedAt: {},
    }),

  fetchSessionDiff: async (sessionID, opts) => {
    const force = !!opts?.force
    const state = get()
    if (!sessionID) return
    if (state.loading[sessionID]) return

    const lastFetched = state.fetchedAt[sessionID]
    if (!force && lastFetched && Date.now() - lastFetched < DIFF_CACHE_TTL_MS) {
      return
    }

    set((prev) => ({
      loading: {
        ...prev.loading,
        [sessionID]: true,
      },
      error: {
        ...prev.error,
        [sessionID]: null,
      },
    }))

    try {
      const normalized = await fetchDiffForSession(sessionID)
      set((prev) => ({
        bySession: {
          ...prev.bySession,
          [sessionID]: normalized,
        },
        loading: {
          ...prev.loading,
          [sessionID]: false,
        },
        error: {
          ...prev.error,
          [sessionID]: null,
        },
        fetchedAt: {
          ...prev.fetchedAt,
          [sessionID]: Date.now(),
        },
      }))
    } catch (error) {
      set((prev) => ({
        loading: {
          ...prev.loading,
          [sessionID]: false,
        },
        error: {
          ...prev.error,
          [sessionID]: toErrorMessage(error),
        },
      }))
    }
  },

  setSessionDiff: (sessionID, diff) => {
    const normalized = mergeDiffs(normalizeDiffList(diff))
    set((prev) => ({
      bySession: {
        ...prev.bySession,
        [sessionID]: normalized,
      },
      loading: {
        ...prev.loading,
        [sessionID]: false,
      },
      error: {
        ...prev.error,
        [sessionID]: null,
      },
      fetchedAt: {
        ...prev.fetchedAt,
        [sessionID]: Date.now(),
      },
    }))
  },

  invalidate: (sessionID) => {
    set((prev) => {
      const nextFetchedAt = { ...prev.fetchedAt }
      delete nextFetchedAt[sessionID]
      return {
        fetchedAt: nextFetchedAt,
      }
    })
  },
}))
