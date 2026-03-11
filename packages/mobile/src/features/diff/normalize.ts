import type { SessionFileDiff } from "./types"
import { resolveDiffLineCounts } from "./counts"

function asString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function asNumber(value: unknown) {
  return Number.isFinite(value) ? Number(value) : 0
}

function resolveFilePath(diff: Record<string, unknown>) {
  const candidates = [
    diff.file,
    diff.path,
    diff.filePath,
    diff.filepath,
    diff.relativePath,
    diff.filename,
    diff.name,
  ]
  for (const candidate of candidates) {
    const value = asString(candidate).trim()
    if (value) return value
  }
  return ""
}

export function normalizeDiffEntry(input: unknown): SessionFileDiff | null {
  const diff = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >
  const file = resolveFilePath(diff)
  if (!file) return null
  const before = asString(diff.before)
  const after = asString(diff.after)
  const providedAdditions = Math.max(0, asNumber(diff.additions))
  const providedDeletions = Math.max(0, asNumber(diff.deletions))
  const status = asString(diff.status || diff.type) || undefined
  const { additions, deletions } = resolveDiffLineCounts({
    file,
    before,
    after,
    additions: providedAdditions,
    deletions: providedDeletions,
    status,
  })

  return {
    file,
    before,
    after,
    additions,
    deletions,
    status,
  }
}

export function dedupeDiffs(input: SessionFileDiff[]) {
  const byFile = new Map<string, SessionFileDiff>()
  for (const entry of input) {
    if (!entry.file) continue
    const previous = byFile.get(entry.file)
    if (!previous) {
      byFile.set(entry.file, entry)
      continue
    }

    const before = entry.before || previous.before
    const after = entry.after || previous.after
    byFile.set(entry.file, {
      file: entry.file,
      before,
      after,
      additions: Math.max(previous.additions, entry.additions),
      deletions: Math.max(previous.deletions, entry.deletions),
      status: entry.status ?? previous.status,
    })
  }
  return [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file))
}

export function normalizeDiffList(
  input: unknown,
  empty: SessionFileDiff[] = [],
): SessionFileDiff[] {
  if (!Array.isArray(input) || input.length === 0) return empty
  const normalized = input
    .map((item) => normalizeDiffEntry(item))
    .filter((item): item is SessionFileDiff => !!item)
  if (normalized.length === 0) return empty
  return dedupeDiffs(normalized)
}
