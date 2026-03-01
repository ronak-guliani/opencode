import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Feather from "@expo/vector-icons/Feather"
import type { AssistantMessage as AssistantMessageData, Message as ChatMessage } from "@opencode-ai/sdk/client"
import { useTheme } from "../../../../src/theme"
import { useMessages } from "../../../../src/store/messages"
import { useSessions } from "../../../../src/store/sessions"
import { computeSummary, useDiffs } from "../../../../src/store/diffs"
import { parseUnifiedDiffRows } from "../../../../src/features/diff/parse"
import { resolveDiffLineCounts } from "../../../../src/features/diff/counts"
import { synthesizeSessionDiff } from "../../../../src/features/diff/synthetic"
import type { DiffLine, SessionFileDiff } from "../../../../src/features/diff/types"
import { useSessionPartsMap } from "../../../../src/api/hooks"

const FeatherIcon = Feather as unknown as React.ComponentType<{ name: string; size: number; color: string }>

const EMPTY_DIFFS: SessionFileDiff[] = []
const INITIAL_LINE_CAP = 800
const LOAD_MORE_STEP = 400
const MAX_RENDERABLE_DIFF_CHARS = 200_000
const PARSED_ROWS_CACHE_MAX = 180

type ExpandedMap = Record<string, boolean>
type LineCapMap = Record<string, number>
type DiffMode = "session" | "turn"

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

function normalizeDiffEntry(input: unknown): SessionFileDiff | null {
  const diff = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const file = resolveFilePath(diff)
  if (!file) return null
  const before = asString(diff.before)
  const after = asString(diff.after)
  const providedAdditions = Math.max(0, asNumber(diff.additions))
  const providedDeletions = Math.max(0, asNumber(diff.deletions))
  const status = asString(diff.status || diff.type) || undefined
  const { additions, deletions } = resolveDiffLineCounts(
    {
      file,
      before,
      after,
      additions: providedAdditions,
      deletions: providedDeletions,
      status,
    },
    { maxChars: MAX_RENDERABLE_DIFF_CHARS },
  )

  return {
    file,
    before,
    after,
    additions,
    deletions,
    status,
  }
}

function dedupeDiffs(input: SessionFileDiff[]): SessionFileDiff[] {
  const byFile = new Map<string, SessionFileDiff>()
  for (const entry of input) {
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

function hashText(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function diffCacheKey(diff: SessionFileDiff) {
  return `${diff.file}\u0000${hashText(diff.before ?? "")}\u0000${hashText(diff.after ?? "")}`
}

export default function SessionDiffScreen() {
  const params = useLocalSearchParams<{ id: string; mode?: string | string[]; turnMessageID?: string | string[] }>()
  const id = params.id
  const modeValue = Array.isArray(params.mode) ? params.mode[0] : params.mode
  const turnMessageIDValue = Array.isArray(params.turnMessageID) ? params.turnMessageID[0] : params.turnMessageID
  const mode: DiffMode = modeValue === "turn" ? "turn" : "session"
  const turnMessageID = typeof turnMessageIDValue === "string" ? turnMessageIDValue : ""
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const theme = useTheme()
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<ExpandedMap>({})
  const [lineCap, setLineCap] = useState<LineCapMap>({})
  const parsedRowsCacheRef = useRef<Map<string, DiffLine[]>>(new Map())

  const session = useSessions((s) => (id ? s.sessions.find((item) => item.id === id) : undefined))
  const sessionMessages = useMessages((s) => (id ? s.messages[id] ?? [] : []))
  const partsByMessage = useSessionPartsMap(id)
  const diffs = useDiffs((s) => (id ? s.bySession[id] ?? EMPTY_DIFFS : EMPTY_DIFFS))
  const loading = useDiffs((s) => (id ? s.loading[id] ?? false : false))
  const error = useDiffs((s) => (id ? s.error[id] ?? null : null))
  const fetchSessionDiff = useDiffs((s) => s.fetchSessionDiff)

  useEffect(() => {
    if (!id || mode !== "session") return
    void fetchSessionDiff(id)
  }, [fetchSessionDiff, id, mode])

  const latestUserMessageID = useMemo(() => {
    for (let index = sessionMessages.length - 1; index >= 0; index -= 1) {
      if (sessionMessages[index]?.role === "user") return sessionMessages[index]?.id
    }
    return ""
  }, [sessionMessages])

  const assistantByParentID = useMemo(() => {
    const result = new Map<string, AssistantMessageData[]>()
    for (const message of sessionMessages) {
      if (message.role !== "assistant") continue
      const assistant = message as AssistantMessageData
      const parentID = asString(assistant.parentID)
      if (!parentID) continue
      const existing = result.get(parentID)
      if (existing) {
        existing.push(assistant)
      } else {
        result.set(parentID, [assistant])
      }
    }
    return result
  }, [sessionMessages])

  const targetTurnMessageID = mode === "turn" ? (turnMessageID || latestUserMessageID) : ""

  const turnDiffs = useMemo(() => {
    if (mode !== "turn" || !targetTurnMessageID) return EMPTY_DIFFS
    for (let index = sessionMessages.length - 1; index >= 0; index--) {
      const message = sessionMessages[index] as { id?: unknown; role?: unknown; summary?: { diffs?: unknown } }
      if (asString(message.id) !== targetTurnMessageID) continue
      if (message.role !== "user") continue
      const next = message.summary?.diffs
      if (!Array.isArray(next) || next.length === 0) continue
      return next as SessionFileDiff[]
    }
    return EMPTY_DIFFS
  }, [mode, sessionMessages, targetTurnMessageID])

  const apiDiffs = useMemo(() => {
    const normalized = diffs
      .map((item) => normalizeDiffEntry(item))
      .filter((item): item is SessionFileDiff => !!item)
    return dedupeDiffs(normalized)
  }, [diffs])

  const normalizedTurnDiffs = useMemo(() => {
    const normalized = turnDiffs
      .map((item) => normalizeDiffEntry(item))
      .filter((item): item is SessionFileDiff => !!item)
    return dedupeDiffs(normalized)
  }, [turnDiffs])

  const syntheticTurnDiffs = useMemo(() => {
    if (mode !== "turn" || !targetTurnMessageID) return EMPTY_DIFFS

    const user = sessionMessages.find((message) => message.role === "user" && message.id === targetTurnMessageID)
    if (!user) return EMPTY_DIFFS

    const assistants = assistantByParentID.get(targetTurnMessageID) ?? []
    const turnMessages: ChatMessage[] = [user, ...assistants]
    if (turnMessages.length === 0) return EMPTY_DIFFS

    try {
      const synthesized = synthesizeSessionDiff(turnMessages, partsByMessage)
      const normalized = synthesized
        .map((item) => normalizeDiffEntry(item))
        .filter((item): item is SessionFileDiff => !!item)
      return dedupeDiffs(normalized)
    } catch {
      return EMPTY_DIFFS
    }
  }, [assistantByParentID, mode, partsByMessage, sessionMessages, targetTurnMessageID])

  const syntheticSessionDiffs = useMemo(() => {
    if (mode !== "session" || sessionMessages.length === 0) return EMPTY_DIFFS
    try {
      const synthesized = synthesizeSessionDiff(sessionMessages, partsByMessage)
      const normalized = synthesized
        .map((item) => normalizeDiffEntry(item))
        .filter((item): item is SessionFileDiff => !!item)
      return dedupeDiffs(normalized)
    } catch {
      return EMPTY_DIFFS
    }
  }, [mode, partsByMessage, sessionMessages])

  const sessionDiffsMerged = useMemo(() => dedupeDiffs([...apiDiffs, ...syntheticSessionDiffs]), [apiDiffs, syntheticSessionDiffs])
  const turnDiffsMerged = useMemo(() => dedupeDiffs([...normalizedTurnDiffs, ...syntheticTurnDiffs]), [normalizedTurnDiffs, syntheticTurnDiffs])
  const safeDiffs = mode === "turn" ? turnDiffsMerged : sessionDiffsMerged

  const summaryFromDiffs = useMemo(() => computeSummary(safeDiffs), [safeDiffs])
  const summary =
    mode === "session"
      ? {
          files: Math.max(summaryFromDiffs.files, Math.max(0, session?.summary?.files ?? 0)),
          additions: Math.max(summaryFromDiffs.additions, Math.max(0, session?.summary?.additions ?? 0)),
          deletions: Math.max(summaryFromDiffs.deletions, Math.max(0, session?.summary?.deletions ?? 0)),
        }
      : summaryFromDiffs

  const normalizedQuery = query.trim().toLowerCase()
  const filteredDiffs = useMemo(() => {
    if (!normalizedQuery) return safeDiffs
    return safeDiffs.filter((item) => item.file.toLowerCase().includes(normalizedQuery))
  }, [safeDiffs, normalizedQuery])

  useEffect(() => {
    const validKeys = new Set(safeDiffs.map(diffCacheKey))
    const cache = parsedRowsCacheRef.current
    for (const key of [...cache.keys()]) {
      if (!validKeys.has(key)) cache.delete(key)
    }
  }, [safeDiffs])

  const getParsedRows = useCallback((item: SessionFileDiff) => {
    const key = diffCacheKey(item)
    const cache = parsedRowsCacheRef.current
    const cached = cache.get(key)
    if (cached) {
      cache.delete(key)
      cache.set(key, cached)
      return cached
    }

    const parsed = safeParseRows(item)
    cache.set(key, parsed)

    while (cache.size > PARSED_ROWS_CACHE_MAX) {
      const oldest = cache.keys().next().value
      if (!oldest) break
      cache.delete(oldest)
    }

    return parsed
  }, [])

  const onRefresh = useCallback(() => {
    if (!id || mode !== "session") return
    void fetchSessionDiff(id, { force: true })
  }, [fetchSessionDiff, id, mode])

  const toggleFile = useCallback((file: string) => {
    setExpanded((prev) => {
      const opening = !prev[file]
      if (opening) {
        setLineCap((cap) => (cap[file] ? cap : { ...cap, [file]: INITIAL_LINE_CAP }))
      }
      return { ...prev, [file]: opening }
    })
  }, [])

  const loadMore = useCallback((file: string) => {
    setLineCap((prev) => ({
      ...prev,
      [file]: Math.max(INITIAL_LINE_CAP, (prev[file] ?? INITIAL_LINE_CAP) + LOAD_MORE_STEP),
    }))
  }, [])

  const renderFile = useCallback(
    ({ item }: { item: SessionFileDiff }) => {
      const isExpanded = !!expanded[item.file]
      const parsedRows = isExpanded ? getParsedRows(item) : EMPTY_LINE_ROWS
      const cap = lineCap[item.file] ?? INITIAL_LINE_CAP
      const visibleRows = isExpanded ? parsedRows.slice(0, cap) : EMPTY_LINE_ROWS
      const remaining = Math.max(0, parsedRows.length - cap)

      return (
        <View style={[styles.fileCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          <Pressable style={styles.fileHeader} onPress={() => toggleFile(item.file)}>
            <View style={styles.fileHeadMain}>
              <Text style={[styles.filePath, { color: theme.colors.text }]} numberOfLines={1}>
                {item.file}
              </Text>
              <View style={styles.fileMeta}>
                <StatusBadge status={statusOf(item)} />
                <Text style={[styles.fileCountPlus, { color: theme.colors.success }]}>+{item.additions}</Text>
                <Text style={[styles.fileCountMinus, { color: theme.colors.error }]}>-{item.deletions}</Text>
              </View>
            </View>
            <FeatherIcon name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={theme.colors.textTertiary} />
          </Pressable>
          {isExpanded ? (
            <View style={[styles.rowsWrap, { borderTopColor: theme.colors.borderSubtle }]}>
              {visibleRows.map((line, index) => (
                <DiffLineRow key={`${item.file}:${index}`} line={line} />
              ))}
              {remaining > 0 ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.loadMore,
                    pressed && styles.pressed,
                    { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceRaised },
                  ]}
                  onPress={() => loadMore(item.file)}
                >
                  <Text style={[styles.loadMoreText, { color: theme.colors.textSecondary }]}>
                    Load more lines ({remaining})
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      )
    },
    [expanded, getParsedRows, lineCap, loadMore, theme.colors.border, theme.colors.error, theme.colors.success, theme.colors.surface, theme.colors.text, theme.colors.textTertiary, theme.colors.borderSubtle, theme.colors.surfaceRaised, theme.colors.textSecondary, toggleFile],
  )

  if (!id) return null

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: theme.colors.border,
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
            <FeatherIcon name="chevron-left" size={19} color={theme.colors.text} />
          </Pressable>
          <View style={styles.headerMain}>
            <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
              {session?.title?.trim() || "Session diff"}
            </Text>
          </View>
        </View>
        <View style={styles.chips}>
          <SummaryChip label="files" value={`${summary.files}`} />
          <SummaryChip label="added" value={`+${summary.additions}`} valueColor={theme.colors.success} />
          <SummaryChip label="removed" value={`-${summary.deletions}`} valueColor={theme.colors.error} />
        </View>
      </View>

      <FlatList
        data={filteredDiffs}
        renderItem={renderFile}
        keyExtractor={(item) => item.file}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={[styles.searchWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              <FeatherIcon name="search" size={14} color={theme.colors.textTertiary} />
              <TextInput
                style={[styles.searchInput, { color: theme.colors.text }]}
                value={query}
                onChangeText={setQuery}
                placeholder="Search files"
                placeholderTextColor={theme.colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {!loading && filteredDiffs.length === 0 ? (
              <View style={styles.empty}>
                <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                  {safeDiffs.length === 0
                    ? mode === "turn"
                      ? "No file changes in this turn."
                      : "No file changes in this session."
                    : "No files match your search."}
                </Text>
                {mode === "session" && error ? <Text style={[styles.emptyMeta, { color: theme.colors.error }]}>{error}</Text> : null}
                {mode === "session" && error ? (
                  <Pressable
                    style={({ pressed }) => [styles.retry, pressed && styles.pressed, { borderColor: theme.colors.border }]}
                    onPress={onRefresh}
                  >
                    <Text style={[styles.retryText, { color: theme.colors.textSecondary }]}>Retry</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        }
        ListFooterComponent={<View style={{ height: Math.max(insets.bottom + 16, 28) }} />}
        refreshing={mode === "session" && loading}
        onRefresh={onRefresh}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
      />
    </View>
  )
}

function StatusBadge({ status }: { status: string }) {
  const theme = useTheme()
  const color = status === "added" ? theme.colors.success : status === "deleted" ? theme.colors.error : theme.colors.textTertiary
  return (
    <View style={[styles.statusBadge, { borderColor: color }]}>
      <Text style={[styles.statusText, { color }]}>{status}</Text>
    </View>
  )
}

function SummaryChip({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  const theme = useTheme()
  return (
    <View style={[styles.summaryChip, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <Text style={[styles.summaryValue, { color: valueColor ?? theme.colors.text }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: theme.colors.textTertiary }]}>{label}</Text>
    </View>
  )
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const theme = useTheme()
  const rowStyle = [
    styles.row,
    line.type === "added"
      ? styles.addedRow
      : line.type === "removed"
        ? styles.removedRow
        : line.type === "meta"
          ? styles.metaRow
          : null,
  ]
  const textColor =
    line.type === "added"
      ? theme.colors.success
      : line.type === "removed"
        ? theme.colors.error
        : line.type === "meta"
          ? theme.colors.textTertiary
          : theme.colors.text

  return (
    <View style={rowStyle}>
      <Text style={[styles.lineNo, { color: theme.colors.textTertiary }]}>{line.leftLineNo ?? ""}</Text>
      <Text style={[styles.lineNo, { color: theme.colors.textTertiary }]}>{line.rightLineNo ?? ""}</Text>
      <Text style={[styles.lineText, { color: textColor }]}>{line.text || " "}</Text>
    </View>
  )
}

function statusOf(diff: SessionFileDiff) {
  if (diff.status) return diff.status
  const hasBefore = !!diff.before
  const hasAfter = !!diff.after
  if (!hasBefore && hasAfter) return "added"
  if (hasBefore && !hasAfter) return "deleted"
  if (diff.additions > 0 || diff.deletions > 0 || diff.before !== diff.after) return "modified"
  return "unchanged"
}

function safeParseRows(diff: SessionFileDiff): DiffLine[] {
  const before = typeof diff.before === "string" ? diff.before : ""
  const after = typeof diff.after === "string" ? diff.after : ""
  if (before.length + after.length > MAX_RENDERABLE_DIFF_CHARS) {
    return [
      {
        type: "meta",
        leftLineNo: null,
        rightLineNo: null,
        text: "Diff too large to render on mobile.",
      },
    ]
  }

  try {
    return parseUnifiedDiffRows({
      ...diff,
      before,
      after,
    })
  } catch {
    return [
      {
        type: "meta",
        leftLineNo: null,
        rightLineNo: null,
        text: "Unable to render diff for this file.",
      },
    ]
  }
}

const EMPTY_LINE_ROWS: DiffLine[] = []

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  headerMain: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  chips: {
    flexDirection: "row",
    gap: 8,
  },
  summaryChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 80,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  summaryLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    marginTop: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  listHeader: {
    marginBottom: 12,
    gap: 12,
  },
  searchWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    minHeight: 42,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: Platform.OS === "ios" ? 9 : 7,
  },
  fileCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    marginBottom: 10,
    overflow: "hidden",
  },
  fileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  fileHeadMain: {
    flex: 1,
    gap: 8,
  },
  filePath: {
    fontSize: 13,
    fontWeight: "600",
  },
  fileMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusText: {
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  fileCountPlus: {
    fontSize: 12,
    fontWeight: "600",
  },
  fileCountMinus: {
    fontSize: 12,
    fontWeight: "600",
  },
  rowsWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  addedRow: {
    backgroundColor: "rgba(16, 185, 129, 0.11)",
  },
  removedRow: {
    backgroundColor: "rgba(239, 68, 68, 0.11)",
  },
  metaRow: {
    backgroundColor: "rgba(148, 163, 184, 0.12)",
  },
  lineNo: {
    width: 34,
    fontSize: 11,
    textAlign: "right",
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  lineText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  loadMore: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    margin: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  loadMoreText: {
    fontSize: 12,
    fontWeight: "600",
  },
  retry: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "600",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 24,
  },
  emptyTitle: {
    fontSize: 14,
    textAlign: "center",
  },
  emptyMeta: {
    fontSize: 12,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.65,
  },
})
