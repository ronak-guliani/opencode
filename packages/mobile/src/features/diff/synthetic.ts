import type { Message, Part } from "@opencode-ai/sdk/client"
import type { SessionFileDiff } from "./types"

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object"
}

function asString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function asNumber(value: unknown) {
  return Number.isFinite(value) ? Number(value) : 0
}

function lineCount(text: unknown) {
  if (typeof text !== "string" || text.length === 0) return 0
  return text.split(/\r\n|\r|\n/).length
}

function cleanPath(value: unknown) {
  const next = asString(value).trim()
  return next || ""
}

function inferStatus(before: string, after: string): SessionFileDiff["status"] {
  if (before && !after) return "deleted"
  if (!before && after) return "added"
  return "modified"
}

function mergeDiff(existing: SessionFileDiff | undefined, next: SessionFileDiff): SessionFileDiff {
  if (!existing) return next
  const before = next.before || existing.before || ""
  const after = next.after || existing.after || ""
  return {
    file: next.file,
    before,
    after,
    additions: Math.max(existing.additions ?? 0, next.additions ?? 0),
    deletions: Math.max(existing.deletions ?? 0, next.deletions ?? 0),
    status: next.status ?? existing.status ?? inferStatus(before, after),
  }
}

function upsertDiff(map: Map<string, SessionFileDiff>, next: SessionFileDiff) {
  if (!next.file) return
  map.set(next.file, mergeDiff(map.get(next.file), next))
}

function upsertPatchFile(map: Map<string, SessionFileDiff>, file: string) {
  const path = cleanPath(file)
  if (!path) return
  upsertDiff(map, {
    file: path,
    before: "",
    after: "",
    additions: 0,
    deletions: 0,
    status: "modified",
  })
}

function upsertFilePart(map: Map<string, SessionFileDiff>, part: Extract<Part, { type: "file" }>) {
  const source = isObject(part.source) ? part.source : undefined
  const sourcePath = source ? cleanPath(source.path) : ""
  const path = cleanPath(sourcePath || part.filename || part.url || part.id)
  if (!path) return
  const sourceText = source && isObject(source.text) ? source.text : undefined
  const after = asString(sourceText?.value)
  upsertDiff(map, {
    file: path,
    before: "",
    after,
    additions: lineCount(after),
    deletions: 0,
    status: "added",
  })
}

function mapApplyPatchStatus(value: unknown): SessionFileDiff["status"] {
  const type = cleanPath(value).toLowerCase()
  if (type === "add") return "added"
  if (type === "delete") return "deleted"
  if (type === "move") return "renamed"
  return "modified"
}

function upsertToolPart(map: Map<string, SessionFileDiff>, part: Extract<Part, { type: "tool" }>) {
  const stateRecord = isObject(part.state) ? (part.state as Record<string, unknown>) : undefined
  const stateInput = stateRecord && isObject(stateRecord["input"]) ? stateRecord["input"] : undefined
  const stateMeta = stateRecord && isObject(stateRecord["metadata"]) ? stateRecord["metadata"] : undefined
  const partMeta = isObject(part.metadata) ? part.metadata : undefined
  const metadata = { ...(partMeta ?? {}), ...(stateMeta ?? {}) }

  const attachments = stateRecord && Array.isArray(stateRecord["attachments"]) ? stateRecord["attachments"] : []
  for (const attachment of attachments) {
    if (!isObject(attachment) || attachment.type !== "file") continue
    upsertFilePart(map, attachment as Extract<Part, { type: "file" }>)
  }

  if (part.tool === "apply_patch") {
    const files = Array.isArray(metadata.files) ? metadata.files : []
    for (const item of files) {
      if (!isObject(item)) continue
      const file = cleanPath(item.movePath || item.filePath || item.relativePath || item.file)
      if (!file) continue
      const before = asString(item.before)
      const after = asString(item.after)
      upsertDiff(map, {
        file,
        before,
        after,
        additions: Math.max(0, asNumber(item.additions)),
        deletions: Math.max(0, asNumber(item.deletions)),
        status: mapApplyPatchStatus(item.type),
      })
    }
    return
  }

  if (part.tool === "edit") {
    const filediff = isObject(metadata.filediff) ? metadata.filediff : undefined
    if (!filediff) return
    const file = cleanPath(filediff.file || filediff.path || stateInput?.filePath)
    if (!file) return
    const before = asString(filediff.before)
    const after = asString(filediff.after)
    upsertDiff(map, {
      file,
      before,
      after,
      additions: Math.max(0, asNumber(filediff.additions)),
      deletions: Math.max(0, asNumber(filediff.deletions)),
      status: inferStatus(before, after),
    })
    return
  }

  if (part.tool === "write") {
    const file = cleanPath(stateInput?.filePath || metadata.filepath || metadata.filePath)
    const after = asString(stateInput?.content)
    const existed = typeof metadata.exists === "boolean" ? metadata.exists : undefined
    if (!file || !after) return
    if (existed === false) {
      upsertDiff(map, {
        file,
        before: "",
        after,
        additions: lineCount(after),
        deletions: 0,
        status: "added",
      })
      return
    }
    upsertDiff(map, {
      file,
      before: "",
      after,
      additions: 0,
      deletions: 0,
      status: "modified",
    })
  }
}

export function synthesizeSessionDiff(messages: Message[], partsByMessage: Record<string, Part[]>): SessionFileDiff[] {
  try {
    if (!Array.isArray(messages) || messages.length === 0 || !isObject(partsByMessage)) return []
    const byFile = new Map<string, SessionFileDiff>()

    for (const message of messages) {
      const messageID = cleanPath(message?.id)
      if (!messageID) continue
      const parts = partsByMessage[messageID]
      if (!Array.isArray(parts)) continue

      for (const part of parts) {
        if (!isObject(part)) continue
        if (part.type === "patch") {
          const files = Array.isArray(part.files) ? part.files : []
          for (const file of files) {
            if (typeof file !== "string") continue
            upsertPatchFile(byFile, file)
          }
          continue
        }

        if (part.type === "file") {
          upsertFilePart(byFile, part as Extract<Part, { type: "file" }>)
          continue
        }

        if (part.type === "tool") {
          upsertToolPart(byFile, part as Extract<Part, { type: "tool" }>)
        }
      }
    }

    return [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file))
  } catch {
    return []
  }
}
