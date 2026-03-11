import { useMemo, useRef } from "react"
import { useSessions } from "../store/sessions"
import { useMessages as useMessageStore } from "../store/messages"
import { useRequests, type PendingQuestion } from "../store/requests"
import { computeSummary } from "../store/diffs"
import { synthesizeSessionDiff } from "../features/diff/synthetic"
import type { DiffSummary, SessionFileDiff } from "../features/diff/types"
import { dedupeDiffs, normalizeDiffEntry, normalizeDiffList } from "../features/diff/normalize"
import type { Message, Part, Session, SessionStatus } from "@opencode-ai/sdk/client"

const EMPTY_MESSAGES: Message[] = []
const EMPTY_PARTS: Part[] = []
const EMPTY_PARTS_MAP: Record<string, Part[]> = {}
const EMPTY_DIFFS: SessionFileDiff[] = []
const EMPTY_SUMMARY: DiffSummary = { files: 0, additions: 0, deletions: 0 }

const SESSION_DIFF_SUMMARY_CACHE_MAX = 120
const sessionDiffSummaryCache = new Map<
  string,
  {
    messageRef: Message[]
    value: SessionDiffSummary
  }
>()
const messageSummaryDiffCache = new Map<
  string,
  {
    source: unknown[]
    value: SessionFileDiff[]
  }
>()

export type SessionDiffSummary = {
  historyDiffs: SessionFileDiff[]
  historySummary: DiffSummary
  syntheticDiffs: SessionFileDiff[]
  syntheticSummary: DiffSummary
}

export function useSessionList(): Session[] {
  return useSessions((s) => s.sessions)
}

export function useSession(id: string): Session | undefined {
  return useSessions((s) => s.sessionByID[id])
}

export function useCurrentSessionId(): string | null {
  return useSessions((s) => s.current)
}

export function useSessionStatus(id: string): SessionStatus | undefined {
  return useSessions((s) => s.statuses[id])
}

export function useSessionMessages(sessionID: string): Message[] {
  return useMessageStore((s) => s.messages[sessionID] ?? EMPTY_MESSAGES)
}

export function useMessageParts(messageID: string): Part[] {
  return useMessageStore((s) => s.parts[messageID] ?? EMPTY_PARTS)
}

export function useSessionPartsMap(sessionID: string | undefined): Record<string, Part[]> {
  const previous = useRef<Record<string, Part[]>>(EMPTY_PARTS_MAP)
  const messages = useMessageStore((s) => (sessionID ? s.messages[sessionID] ?? EMPTY_MESSAGES : EMPTY_MESSAGES))
  const partsVersion = useMessageStore((s) => (sessionID ? s.partsVersionBySession[sessionID] ?? 0 : 0))

  return useMemo(() => {
    if (!sessionID || messages.length === 0) {
      if (previous.current !== EMPTY_PARTS_MAP) previous.current = EMPTY_PARTS_MAP
      return EMPTY_PARTS_MAP
    }

    const partsByMessage = useMessageStore.getState().parts
    const prior = previous.current
    let changed = false
    let nextCount = 0
    let previousCount = 0
    const next: Record<string, Part[]> = {}

    for (const key in prior) previousCount += 1

    for (const message of messages) {
      const parts = partsByMessage[message.id]
      if (!parts) continue
      next[message.id] = parts
      nextCount += 1
      if (prior[message.id] !== parts) changed = true
    }

    if (!changed && previousCount !== nextCount) changed = true
    if (!changed) return prior

    previous.current = next
    return next
  }, [messages, partsVersion, sessionID])
}

export function useIsSending(sessionID: string): boolean {
  return useMessageStore((s) => s.sending[sessionID] ?? false)
}

export function usePendingRequestCount(sessionID: string | undefined): number {
  return useRequests((s) => (sessionID ? s.pendingCountBySession[sessionID] ?? 0 : 0))
}

export function useSessionDiffSummary(sessionID: string, opts?: { includeSynthetic?: boolean }): SessionDiffSummary {
  const includeSynthetic = opts?.includeSynthetic ?? false
  const messages = useMessageStore((s) => s.messages[sessionID] ?? EMPTY_MESSAGES)
  const lastMessageID = useMessageStore((s) => s.lastMessageIDBySession[sessionID] ?? "")
  const partsVersion = useMessageStore((s) => (includeSynthetic ? s.partsVersionBySession[sessionID] ?? 0 : 0))

  return useMemo(() => {
    if (!sessionID || messages.length === 0) {
      return {
        historyDiffs: EMPTY_DIFFS,
        historySummary: EMPTY_SUMMARY,
        syntheticDiffs: EMPTY_DIFFS,
        syntheticSummary: EMPTY_SUMMARY,
      }
    }

    const cacheKey = `${sessionID}:${lastMessageID}:${partsVersion}:${includeSynthetic ? 1 : 0}`
    const cached = sessionDiffSummaryCache.get(cacheKey)
    if (cached && cached.messageRef === messages) return cached.value

    const historyDiffs = deriveHistoryDiffs(messages)
    const historySummary = computeSummary(historyDiffs)
    const syntheticDiffs =
      includeSynthetic && historyDiffs.length === 0 ? deriveSyntheticDiffs(messages) : EMPTY_DIFFS
    const syntheticSummary = syntheticDiffs.length > 0 ? computeSummary(syntheticDiffs) : EMPTY_SUMMARY
    const value: SessionDiffSummary = {
      historyDiffs,
      historySummary,
      syntheticDiffs,
      syntheticSummary,
    }

    sessionDiffSummaryCache.set(cacheKey, { messageRef: messages, value })
    while (sessionDiffSummaryCache.size > SESSION_DIFF_SUMMARY_CACHE_MAX) {
      const oldest = sessionDiffSummaryCache.keys().next().value
      if (!oldest) break
      sessionDiffSummaryCache.delete(oldest)
    }

    return value
  }, [includeSynthetic, lastMessageID, messages, partsVersion, sessionID])
}

export function useSessionPermissions(sessionID: string) {
  const permissions = useRequests((s) => s.permissions)
  return useMemo(() => permissions.filter((item) => item.sessionID === sessionID), [permissions, sessionID])
}

export function useSessionQuestions(sessionID: string): PendingQuestion[] {
  const questions = useRequests((s) => s.questions)
  return useMemo(() => questions.filter((item) => item.sessionID === sessionID), [questions, sessionID])
}

function deriveHistoryDiffs(messages: Message[]) {
  if (!Array.isArray(messages) || messages.length === 0) return EMPTY_DIFFS

  const normalized: SessionFileDiff[] = []
  for (const message of messages) {
    if (message.role !== "user") continue
    const summary = (message as { summary?: { diffs?: unknown } }).summary
    if (!Array.isArray(summary?.diffs) || summary.diffs.length === 0) continue

    const cached = messageSummaryDiffCache.get(message.id)
    if (cached && cached.source === summary.diffs) {
      normalized.push(...cached.value)
      continue
    }

    const next = normalizeDiffList(summary.diffs, EMPTY_DIFFS)
    messageSummaryDiffCache.set(message.id, {
      source: summary.diffs,
      value: next,
    })
    while (messageSummaryDiffCache.size > 500) {
      const oldest = messageSummaryDiffCache.keys().next().value
      if (!oldest) break
      messageSummaryDiffCache.delete(oldest)
    }
    normalized.push(...next)
  }

  if (normalized.length === 0) return EMPTY_DIFFS
  return dedupeDiffs(normalized)
}

function deriveSyntheticDiffs(messages: Message[]) {
  if (!Array.isArray(messages) || messages.length === 0) return EMPTY_DIFFS
  const parts = useMessageStore.getState().parts
  const partsByMessage: Record<string, Part[]> = {}
  for (const message of messages) {
    const messageParts = parts[message.id]
    if (!Array.isArray(messageParts) || messageParts.length === 0) continue
    partsByMessage[message.id] = messageParts
  }

  try {
    const normalized = synthesizeSessionDiff(messages, partsByMessage)
      .map((item) => normalizeDiffEntry(item))
      .filter((item): item is SessionFileDiff => !!item)
    return normalized.length > 0 ? dedupeDiffs(normalized) : EMPTY_DIFFS
  } catch {
    return EMPTY_DIFFS
  }
}
