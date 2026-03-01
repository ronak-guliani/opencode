import { describe, expect, test } from "bun:test"
import type { DiffSummary, SessionFileDiff } from "../../features/diff/types"
import {
  hasChanges,
  resolveEffectiveSessionData,
  resolveFootersByAssistant,
  resolveSessionFooterMeta,
  resolveTurnDiffs,
  resolveTurnFooterMeta,
} from "./diff-ui-logic"

function diff(file: string, additions: number, deletions: number): SessionFileDiff {
  return {
    file,
    before: "",
    after: "",
    additions,
    deletions,
    status: "modified",
  }
}

function summary(files: number, additions: number, deletions: number): DiffSummary {
  return { files, additions, deletions }
}

describe("resolveTurnDiffs", () => {
  test("prefers explicit turn summary diffs over synthetic fallback", () => {
    const summaryDiffs = [diff("from-summary.ts", 3, 1)]
    const syntheticDiffs = [diff("from-synth.ts", 5, 0)]

    expect(resolveTurnDiffs(summaryDiffs, syntheticDiffs)).toEqual(summaryDiffs)
  })

  test("can prefer synthetic turn diffs for strict per-turn rendering", () => {
    const summaryDiffs = [diff("from-summary.ts", 3, 1)]
    const syntheticDiffs = [diff("from-synth.ts", 5, 0)]

    expect(resolveTurnDiffs(summaryDiffs, syntheticDiffs, { preferSynthetic: true })).toEqual(syntheticDiffs)
  })

  test("uses synthetic turn diffs when summary diffs are missing", () => {
    const syntheticDiffs = [diff("from-synth.ts", 5, 0)]
    expect(resolveTurnDiffs([], syntheticDiffs)).toEqual(syntheticDiffs)
  })
})

describe("resolveTurnFooterMeta", () => {
  test("returns turn footer when latest turn has changes", () => {
    const latestTurnDiffs = [diff("turn.ts", 2, 1)]
    const latestTurnSummary = summary(1, 2, 1)
    const meta = resolveTurnFooterMeta({
      latestTurnDiffs,
      latestTurnSummary,
      latestTurnMessageID: "user-msg-1",
      isBusy: true,
    })

    expect(meta).toEqual({
      diffs: latestTurnDiffs,
      summary: latestTurnSummary,
      isUpdating: true,
      mode: "turn",
      turnMessageID: "user-msg-1",
    })
  })

  test("returns null when latest turn has no changes", () => {
    const meta = resolveTurnFooterMeta({
      latestTurnDiffs: [],
      latestTurnSummary: summary(0, 0, 0),
      latestTurnMessageID: "user-msg-1",
      isBusy: false,
    })
    expect(meta).toBeNull()
  })
})

describe("resolveEffectiveSessionData", () => {
  test("prefers API session diffs when available", () => {
    const apiDiffs = [diff("api.ts", 4, 2)]
    const historyDiffs = [diff("history.ts", 1, 0)]
    const syntheticDiffs = [diff("synthetic.ts", 2, 1)]

    const resolved = resolveEffectiveSessionData({
      apiDiffs,
      apiSummary: summary(1, 4, 2),
      historyDiffs,
      historySummary: summary(1, 1, 0),
      syntheticDiffs,
      syntheticSummary: summary(1, 2, 1),
      sessionSummary: summary(9, 50, 20),
    })

    expect(resolved.diffs).toEqual(apiDiffs)
    expect(resolved.summary).toEqual(summary(1, 4, 2))
  })

  test("falls back to history then synthetic when API data is absent", () => {
    const historyDiffs = [diff("history.ts", 1, 0)]
    const syntheticDiffs = [diff("synthetic.ts", 2, 1)]

    const fromHistory = resolveEffectiveSessionData({
      apiDiffs: [],
      apiSummary: summary(0, 0, 0),
      historyDiffs,
      historySummary: summary(1, 1, 0),
      syntheticDiffs,
      syntheticSummary: summary(1, 2, 1),
      sessionSummary: summary(9, 50, 20),
    })
    expect(fromHistory.diffs).toEqual(historyDiffs)
    expect(fromHistory.summary).toEqual(summary(1, 1, 0))

    const fromSynthetic = resolveEffectiveSessionData({
      apiDiffs: [],
      apiSummary: summary(0, 0, 0),
      historyDiffs: [],
      historySummary: summary(0, 0, 0),
      syntheticDiffs,
      syntheticSummary: summary(1, 2, 1),
      sessionSummary: summary(9, 50, 20),
    })
    expect(fromSynthetic.diffs).toEqual(syntheticDiffs)
    expect(fromSynthetic.summary).toEqual(summary(1, 2, 1))
  })

  test("falls back to session summary for old sessions with no materialized diff list", () => {
    const resolved = resolveEffectiveSessionData({
      apiDiffs: [],
      apiSummary: summary(0, 0, 0),
      historyDiffs: [],
      historySummary: summary(0, 0, 0),
      syntheticDiffs: [],
      syntheticSummary: summary(0, 0, 0),
      sessionSummary: summary(7, 120, 45),
    })

    expect(resolved.diffs).toEqual([])
    expect(resolved.summary).toEqual(summary(7, 120, 45))
  })
})

describe("resolveSessionFooterMeta", () => {
  test("shows session footer when session summary has changes and list has messages", () => {
    const sessionDiffs = [diff("session.ts", 8, 3)]
    const meta = resolveSessionFooterMeta({
      messageCount: 10,
      effectiveSessionDiffs: sessionDiffs,
      effectiveSessionSummary: summary(1, 8, 3),
      isBusy: false,
      sessionDiffLoading: false,
    })

    expect(meta).toEqual({
      diffs: sessionDiffs,
      summary: summary(1, 8, 3),
      isUpdating: false,
      mode: "session",
    })
  })

  test("hides session footer when there are no messages or no changes", () => {
    const hiddenForCount = resolveSessionFooterMeta({
      messageCount: 0,
      effectiveSessionDiffs: [diff("session.ts", 8, 3)],
      effectiveSessionSummary: summary(1, 8, 3),
      isBusy: false,
      sessionDiffLoading: false,
    })
    expect(hiddenForCount).toBeNull()

    const hiddenForSummary = resolveSessionFooterMeta({
      messageCount: 5,
      effectiveSessionDiffs: [],
      effectiveSessionSummary: summary(0, 0, 0),
      isBusy: false,
      sessionDiffLoading: false,
    })
    expect(hiddenForSummary).toBeNull()
  })
})

describe("resolveFootersByAssistant", () => {
  test("attaches turn footer to its assistant and appends session footer only to latest assistant", () => {
    const turnA = resolveTurnFooterMeta({
      latestTurnDiffs: [diff("a.ts", 1, 0)],
      latestTurnSummary: summary(1, 1, 0),
      latestTurnMessageID: "user-a",
      isBusy: false,
    })
    const turnB = resolveTurnFooterMeta({
      latestTurnDiffs: [diff("b.ts", 2, 1)],
      latestTurnSummary: summary(1, 2, 1),
      latestTurnMessageID: "user-b",
      isBusy: false,
    })
    const session = resolveSessionFooterMeta({
      messageCount: 8,
      effectiveSessionDiffs: [diff("a.ts", 3, 1), diff("b.ts", 2, 1)],
      effectiveSessionSummary: summary(2, 5, 2),
      isBusy: false,
      sessionDiffLoading: false,
    })

    expect(turnA).toBeTruthy()
    expect(turnB).toBeTruthy()
    expect(session).toBeTruthy()

    const byAssistant = new Map<string, any>([
      ["assistant-a", turnA!],
      ["assistant-b", turnB!],
    ])
    const combined = resolveFootersByAssistant({
      turnFooterByAssistantID: byAssistant,
      latestAssistantID: "assistant-b",
      sessionFooterMeta: session!,
    })

    expect(combined.get("assistant-a")).toEqual([turnA])
    expect(combined.get("assistant-b")).toEqual([turnB, session])
  })
})

describe("hasChanges", () => {
  test("detects non-zero summary values", () => {
    expect(hasChanges(summary(0, 0, 0))).toBe(false)
    expect(hasChanges(summary(1, 0, 0))).toBe(true)
    expect(hasChanges(summary(0, 2, 0))).toBe(true)
    expect(hasChanges(summary(0, 0, 3))).toBe(true)
  })
})
