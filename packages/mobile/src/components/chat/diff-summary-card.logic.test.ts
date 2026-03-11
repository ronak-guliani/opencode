import { describe, expect, test } from "bun:test"
import type { DiffSummary, SessionFileDiff } from "../../features/diff/types"
import {
  buildDiffIndicatorSegments,
  formatModifiedLabel,
  resolveDiffSummary,
  shouldOpenDiffFromHeader,
} from "./diff-summary-card.logic"

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

describe("resolveDiffSummary", () => {
  test("prefers the larger values between provided summary and materialized diffs", () => {
    const resolved = resolveDiffSummary([diff("a.ts", 2, 1), diff("b.ts", 4, 0)], summary(1, 1, 0))

    expect(resolved).toEqual(summary(2, 6, 1))
  })

  test("preserves summary-only counts when the diff list is absent", () => {
    const resolved = resolveDiffSummary([], summary(8, 40, 12))
    expect(resolved).toEqual(summary(8, 40, 12))
  })
})

describe("formatModifiedLabel", () => {
  test("handles singular and plural file counts", () => {
    expect(formatModifiedLabel(1)).toBe("Modified 1 file")
    expect(formatModifiedLabel(8)).toBe("Modified 8 files")
  })
})

describe("buildDiffIndicatorSegments", () => {
  test("fills all segments for one-sided changes", () => {
    expect(buildDiffIndicatorSegments(5, 0)).toEqual(["success", "success", "success", "success", "success"])
    expect(buildDiffIndicatorSegments(0, 3)).toEqual(["error", "error", "error", "error", "error"])
  })

  test("balances mixed additions and deletions into a fixed segment count", () => {
    expect(buildDiffIndicatorSegments(8, 2)).toEqual(["success", "success", "success", "success", "error"])
    expect(buildDiffIndicatorSegments(2, 8)).toEqual(["success", "error", "error", "error", "error"])
  })
})

describe("shouldOpenDiffFromHeader", () => {
  test("falls back to full diff navigation when only summary counts are available", () => {
    expect(shouldOpenDiffFromHeader([])).toBe(true)
    expect(shouldOpenDiffFromHeader(null)).toBe(true)
    expect(shouldOpenDiffFromHeader([diff("a.ts", 1, 0)])).toBe(false)
  })
})
