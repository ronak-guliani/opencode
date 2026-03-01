import { parseUnifiedDiffRows } from "./parse"
import type { SessionFileDiff } from "./types"

const DEFAULT_INFERENCE_MAX_CHARS = 120_000

type CountsInput = {
  file: string
  before: string
  after: string
  additions: number
  deletions: number
  status?: string
}

type CountsOptions = {
  maxChars?: number
}

function clampCount(value: unknown) {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0
}

export function resolveDiffLineCounts(input: CountsInput, options?: CountsOptions) {
  const additions = clampCount(input.additions)
  const deletions = clampCount(input.deletions)

  if (additions > 0 || deletions > 0) return { additions, deletions }
  if (!input.before && !input.after) return { additions, deletions }
  if (input.before === input.after) return { additions, deletions }

  const maxChars = options?.maxChars ?? DEFAULT_INFERENCE_MAX_CHARS
  if (input.before.length + input.after.length > maxChars) {
    return { additions, deletions }
  }

  try {
    const rows = parseUnifiedDiffRows({
      file: input.file,
      before: input.before,
      after: input.after,
      additions,
      deletions,
      status: (typeof input.status === "string" && input.status) || "modified",
    } satisfies SessionFileDiff)

    let inferredAdditions = 0
    let inferredDeletions = 0
    for (const row of rows) {
      if (row.type === "added") inferredAdditions += 1
      if (row.type === "removed") inferredDeletions += 1
    }

    if (inferredAdditions > 0 || inferredDeletions > 0) {
      return {
        additions: inferredAdditions,
        deletions: inferredDeletions,
      }
    }
  } catch {
    // keep provided counts
  }

  return { additions, deletions }
}

