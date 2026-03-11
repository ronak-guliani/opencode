import { describe, expect, test } from "bun:test"
import { dedupeDiffs, normalizeDiffEntry, normalizeDiffList } from "./normalize"

describe("normalizeDiffEntry", () => {
  test("normalizes path aliases and preserves computed line counts", () => {
    const entry = normalizeDiffEntry({
      filePath: "src/app.ts",
      before: "a\n",
      after: "a\nb\n",
      additions: 0,
      deletions: 0,
      type: "modified",
    })
    expect(entry?.file).toBe("src/app.ts")
    expect(entry?.additions).toBeGreaterThanOrEqual(1)
    expect(entry?.deletions).toBeGreaterThanOrEqual(0)
    expect(entry?.status).toBe("modified")
  })
})

describe("dedupeDiffs", () => {
  test("merges by file with max line counts", () => {
    const merged = dedupeDiffs([
      {
        file: "a.ts",
        before: "",
        after: "",
        additions: 1,
        deletions: 0,
        status: "modified",
      },
      {
        file: "a.ts",
        before: "",
        after: "",
        additions: 3,
        deletions: 2,
        status: "modified",
      },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].additions).toBe(3)
    expect(merged[0].deletions).toBe(2)
  })
})

describe("normalizeDiffList", () => {
  test("returns provided empty sentinel for invalid inputs", () => {
    const sentinel: any[] = []
    expect(normalizeDiffList(undefined, sentinel)).toBe(sentinel)
  })
})
