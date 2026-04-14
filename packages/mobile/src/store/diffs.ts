import { create as createStore } from "zustand"
import { createOpencodeClient } from "@opencode-ai/sdk/client"
import { client } from "../api/client"
import { headers, url } from "../api/client"
import type { DiffSummary, SessionFileDiff } from "../features/diff/types"
import { normalizeDiffList } from "../features/diff/normalize"
import { useSessions } from "./sessions"
import { toErrorMessage } from "../util/error-message"
import { telemetry } from "../perf/telemetry"

const DIFF_CACHE_TTL_MS = 30_000

const EMPTY_SUMMARY: DiffSummary = {
  files: 0,
  additions: 0,
  deletions: 0,
}

function numberOrZero(input: unknown): number {
  return Number.isFinite(input) ? Number(input) : 0
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
  const sessionWorktree = useSessions.getState().sessionByID[sessionID]?.directory
  if (sessionWorktree) {
    try {
      return await fetchDiffFromWorktree(sessionID, sessionWorktree)
    } catch {
      // fallback below
    }
  }

  const currentWorktree = headers()["x-opencode-directory"]
  return await fetchDiffFromWorktree(sessionID, currentWorktree || undefined)
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
      const s = telemetry.span("diff", "diff:fetch", { sessionID })
      const normalized = await fetchDiffForSession(sessionID)
      s.end({ files: normalized.length })
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
          [sessionID]: toErrorMessage(error, "Could not load session diff."),
        },
      }))
    }
  },

  setSessionDiff: (sessionID, diff) => {
    const normalized = normalizeDiffList(diff)
    telemetry.track("diff", "diff:set", { sessionID, files: normalized.length })
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
