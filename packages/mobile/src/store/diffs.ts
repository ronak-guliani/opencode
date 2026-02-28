import { create as createStore } from "zustand"
import { client } from "../api/client"
import type { DiffSummary, SessionFileDiff } from "../features/diff/types"

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

function normalizeDiff(input: unknown): SessionFileDiff {
  const diff = (input && typeof input === "object" ? input : {}) as Partial<SessionFileDiff>
  return {
    file: stringOrEmpty(diff.file),
    before: stringOrEmpty(diff.before),
    after: stringOrEmpty(diff.after),
    additions: Math.max(0, numberOrZero(diff.additions)),
    deletions: Math.max(0, numberOrZero(diff.deletions)),
    status: typeof diff.status === "string" ? diff.status : undefined,
  }
}

function normalizeDiffList(diff: unknown): SessionFileDiff[] {
  if (!Array.isArray(diff)) return []
  return diff.map(normalizeDiff)
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
      const result = await client().session.diff({
        path: { id: sessionID },
      })
      const normalized = normalizeDiffList(result.data as SessionFileDiff[] | undefined)
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
    set((prev) => ({
      bySession: {
        ...prev.bySession,
        [sessionID]: normalizeDiffList(diff),
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
