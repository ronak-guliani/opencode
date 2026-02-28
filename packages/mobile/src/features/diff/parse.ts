import { createTwoFilesPatch, parsePatch } from "diff"
import type { DiffLine, SessionFileDiff } from "./types"

const BINARY_ROW = "Binary or non-text change"
const EMPTY_ROW = "No text changes"

function hasText(value: string | undefined) {
  return typeof value === "string" && value.length > 0
}

function inferChangedStatus(diff: SessionFileDiff) {
  if (diff.status) return diff.status !== "modified" || diff.additions > 0 || diff.deletions > 0
  return diff.additions > 0 || diff.deletions > 0 || diff.before !== diff.after
}

export function parseUnifiedDiffRows(diff: SessionFileDiff): DiffLine[] {
  try {
    const before = diff.before ?? ""
    const after = diff.after ?? ""

    if (!hasText(before) && !hasText(after)) {
      return [
        {
          type: "meta",
          leftLineNo: null,
          rightLineNo: null,
          text: inferChangedStatus(diff) ? BINARY_ROW : EMPTY_ROW,
        },
      ]
    }

    const patch = createTwoFilesPatch(diff.file, diff.file, before, after, "", "", {
      context: 3,
    })
    const parsed = parsePatch(patch)[0]
    if (!parsed || parsed.hunks.length === 0) {
      return [
        {
          type: "meta",
          leftLineNo: null,
          rightLineNo: null,
          text: EMPTY_ROW,
        },
      ]
    }

    const rows: DiffLine[] = []
    for (const hunk of parsed.hunks) {
      let left = hunk.oldStart
      let right = hunk.newStart

      for (const line of hunk.lines) {
        const marker = line[0]
        if (marker === "\\") continue
        const text = line.slice(1)

        if (marker === " ") {
          rows.push({
            type: "context",
            leftLineNo: left,
            rightLineNo: right,
            text,
          })
          left += 1
          right += 1
          continue
        }

        if (marker === "+") {
          rows.push({
            type: "added",
            leftLineNo: null,
            rightLineNo: right,
            text,
          })
          right += 1
          continue
        }

        if (marker === "-") {
          rows.push({
            type: "removed",
            leftLineNo: left,
            rightLineNo: null,
            text,
          })
          left += 1
        }
      }
    }

    return rows.length > 0
      ? rows
      : [
          {
            type: "meta",
            leftLineNo: null,
            rightLineNo: null,
            text: EMPTY_ROW,
          },
        ]
  } catch {
    return [
      {
        type: "meta",
        leftLineNo: null,
        rightLineNo: null,
        text: BINARY_ROW,
      },
    ]
  }
}
