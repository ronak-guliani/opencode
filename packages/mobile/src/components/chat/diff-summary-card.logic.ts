import type { DiffSummary, SessionFileDiff } from "../../features/diff/types"

const ZERO_SUMMARY: DiffSummary = { files: 0, additions: 0, deletions: 0 }

export type DiffIndicatorTone = "success" | "error"

export function resolveDiffSummary(diffs?: SessionFileDiff[] | null, summary?: DiffSummary | null): DiffSummary {
  const safeDiffs = Array.isArray(diffs) ? diffs.filter((item) => !!item?.file) : []
  const summaryFromDiffs = safeDiffs.reduce<DiffSummary>(
    (acc, item) => ({
      files: acc.files + 1,
      additions: acc.additions + Math.max(0, Number.isFinite(item.additions) ? Number(item.additions) : 0),
      deletions: acc.deletions + Math.max(0, Number.isFinite(item.deletions) ? Number(item.deletions) : 0),
    }),
    ZERO_SUMMARY,
  )

  return {
    files: Math.max(
      Number.isFinite(summary?.files) ? Math.max(0, Number(summary?.files)) : ZERO_SUMMARY.files,
      summaryFromDiffs.files,
    ),
    additions: Math.max(
      Number.isFinite(summary?.additions) ? Math.max(0, Number(summary?.additions)) : ZERO_SUMMARY.additions,
      summaryFromDiffs.additions,
    ),
    deletions: Math.max(
      Number.isFinite(summary?.deletions) ? Math.max(0, Number(summary?.deletions)) : ZERO_SUMMARY.deletions,
      summaryFromDiffs.deletions,
    ),
  }
}

export function formatModifiedLabel(files: number) {
  return `Modified ${files} file${files === 1 ? "" : "s"}`
}

export function shouldOpenDiffFromHeader(diffs?: SessionFileDiff[] | null) {
  return !Array.isArray(diffs) || diffs.filter((item) => !!item?.file).length === 0
}

export function buildDiffIndicatorSegments(additions: number, deletions: number, maxSegments = 5): DiffIndicatorTone[] {
  const safeAdditions = Math.max(0, additions)
  const safeDeletions = Math.max(0, deletions)
  const total = safeAdditions + safeDeletions
  if (total <= 0 || maxSegments <= 0) return []

  if (safeAdditions === 0) return Array.from({ length: maxSegments }, () => "error")
  if (safeDeletions === 0) return Array.from({ length: maxSegments }, () => "success")

  const rawAdditions = (safeAdditions / total) * maxSegments
  const rawDeletions = (safeDeletions / total) * maxSegments
  let additionSegments = Math.max(1, Math.round(rawAdditions))
  let deletionSegments = Math.max(1, Math.round(rawDeletions))

  while (additionSegments + deletionSegments > maxSegments) {
    if (additionSegments >= deletionSegments && additionSegments > 1) {
      additionSegments -= 1
      continue
    }
    if (deletionSegments > 1) {
      deletionSegments -= 1
      continue
    }
    break
  }

  while (additionSegments + deletionSegments < maxSegments) {
    if (rawAdditions >= rawDeletions) {
      additionSegments += 1
    } else {
      deletionSegments += 1
    }
  }

  return [
    ...Array.from({ length: additionSegments }, () => "success" as const),
    ...Array.from({ length: deletionSegments }, () => "error" as const),
  ]
}
