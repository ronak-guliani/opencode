import type { DiffSummary, SessionFileDiff } from "../../features/diff/types"

const EMPTY_SUMMARY: DiffSummary = { files: 0, additions: 0, deletions: 0 }
const EMPTY_DIFFS: SessionFileDiff[] = []

export type DiffFooterMeta = {
  diffs: SessionFileDiff[]
  summary: DiffSummary
  isUpdating: boolean
  mode: "session" | "turn"
  turnMessageID?: string
}

export function hasChanges(summary: DiffSummary | null | undefined) {
  if (!summary) return false
  return summary.files > 0 || summary.additions > 0 || summary.deletions > 0
}

export function resolveTurnDiffs(
  summaryDiffs: SessionFileDiff[],
  syntheticDiffs: SessionFileDiff[],
  opts?: { preferSynthetic?: boolean },
) {
  if (opts?.preferSynthetic && syntheticDiffs.length > 0) return syntheticDiffs
  if (summaryDiffs.length > 0) return summaryDiffs
  return syntheticDiffs
}

export function resolveEffectiveSessionData(args: {
  apiDiffs: SessionFileDiff[]
  apiSummary: DiffSummary
  historyDiffs: SessionFileDiff[]
  historySummary: DiffSummary
  syntheticDiffs: SessionFileDiff[]
  syntheticSummary: DiffSummary
  sessionSummary: DiffSummary
}): { diffs: SessionFileDiff[]; summary: DiffSummary } {
  const diffs = args.apiDiffs.length > 0 ? args.apiDiffs : args.historyDiffs.length > 0 ? args.historyDiffs : args.syntheticDiffs
  if (hasChanges(args.apiSummary)) return { diffs, summary: args.apiSummary }
  if (hasChanges(args.historySummary)) return { diffs, summary: args.historySummary }
  if (hasChanges(args.syntheticSummary)) return { diffs, summary: args.syntheticSummary }
  return { diffs: args.sessionSummary.files > 0 ? diffs : EMPTY_DIFFS, summary: args.sessionSummary || EMPTY_SUMMARY }
}

export function resolveTurnFooterMeta(args: {
  latestTurnDiffs: SessionFileDiff[]
  latestTurnSummary: DiffSummary
  latestTurnMessageID: string
  isBusy: boolean
}): DiffFooterMeta | null {
  if (!hasChanges(args.latestTurnSummary)) return null
  return {
    diffs: args.latestTurnDiffs,
    summary: args.latestTurnSummary,
    isUpdating: args.isBusy,
    mode: "turn",
    turnMessageID: args.latestTurnMessageID || undefined,
  }
}

export function resolveSessionFooterMeta(args: {
  messageCount: number
  effectiveSessionDiffs: SessionFileDiff[]
  effectiveSessionSummary: DiffSummary
  isBusy: boolean
  sessionDiffLoading: boolean
}): DiffFooterMeta | null {
  if (args.messageCount === 0) return null
  if (!hasChanges(args.effectiveSessionSummary)) return null
  return {
    diffs: args.effectiveSessionDiffs,
    summary: args.effectiveSessionSummary,
    isUpdating: args.isBusy || args.sessionDiffLoading,
    mode: "session",
  }
}

export function resolveFootersByAssistant(args: {
  turnFooterByAssistantID: Map<string, DiffFooterMeta>
  latestAssistantID: string
  sessionFooterMeta: DiffFooterMeta | null
}) {
  const result = new Map<string, DiffFooterMeta[]>()
  for (const [assistantID, turnFooter] of args.turnFooterByAssistantID.entries()) {
    result.set(assistantID, [turnFooter])
  }
  if (!args.latestAssistantID || !args.sessionFooterMeta) return result

  const current = result.get(args.latestAssistantID) ?? []
  result.set(args.latestAssistantID, [...current, args.sessionFooterMeta])
  return result
}
