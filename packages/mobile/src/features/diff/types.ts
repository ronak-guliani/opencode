import type { FileDiff } from "@opencode-ai/sdk/client"

export type DiffStatus = "added" | "deleted" | "modified" | "renamed" | string

export type SessionFileDiff = FileDiff & {
  status?: DiffStatus
}

export type DiffSummary = {
  files: number
  additions: number
  deletions: number
}

export type DiffLineType = "context" | "added" | "removed" | "meta"

export type DiffLine = {
  type: DiffLineType
  leftLineNo: number | null
  rightLineNo: number | null
  text: string
}
