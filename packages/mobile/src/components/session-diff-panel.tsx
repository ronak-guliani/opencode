import { Component, useCallback, useEffect, useMemo, useRef, useState, memo } from "react"
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Feather from "@expo/vector-icons/Feather"
import { useTheme } from "../theme"
import { useSessions } from "../store/sessions"
import { computeSummary, useDiffs } from "../store/diffs"
import { parseUnifiedDiffRows } from "../features/diff/parse"
import { normalizeDiffList, dedupeDiffs } from "../features/diff/normalize"
import type { DiffLine, SessionFileDiff } from "../features/diff/types"
import { useSessionDiffSummary } from "../api/hooks"
import { telemetry } from "../perf/telemetry"

const FeatherIcon = Feather as unknown as React.ComponentType<{ name: string; size: number; color: string }>

const EMPTY_DIFFS: SessionFileDiff[] = []
const EMPTY_LINES: DiffLine[] = []
const INITIAL_LINE_CAP = 800
const LOAD_MORE_STEP = 400
const MAX_RENDERABLE_DIFF_CHARS = 200_000
const PARSED_ROWS_CACHE_MAX = 180

type ExpandedMap = Record<string, boolean>
type LineCapMap = Record<string, number>

function asNumber(value: unknown) {
  return Number.isFinite(value) ? Number(value) : 0
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
    return [{ type: "meta", leftLineNo: null, rightLineNo: null, text: "Diff too large to render on mobile." }]
  }
  try {
    return parseUnifiedDiffRows({ ...diff, before, after })
  } catch {
    return [{ type: "meta", leftLineNo: null, rightLineNo: null, text: "Unable to render diff for this file." }]
  }
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

function diffKeyExtractor(item: SessionFileDiff) {
  return item.file
}

type Props = {
  sessionId: string | null
}

class DiffPanelBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error("[SessionDiffPanel] crash:", error)
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView
          style={{ flex: 1, backgroundColor: "#18181b", padding: 16 }}
          contentContainerStyle={{ paddingTop: 60 }}
        >
          <Text style={{ color: "#ef4444", fontSize: 14, fontWeight: "600", marginBottom: 8 }}>Diff panel crashed</Text>
          <Text
            style={{
              color: "#a1a1aa",
              fontSize: 12,
              fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
            }}
          >
            {this.state.error.message}
          </Text>
          <Text
            style={{
              color: "#71717a",
              fontSize: 10,
              marginTop: 8,
              fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
            }}
          >
            {this.state.error.stack?.slice(0, 800)}
          </Text>
        </ScrollView>
      )
    }
    return this.props.children
  }
}

export function SessionDiffPanel(props: Props) {
  return (
    <DiffPanelBoundary>
      <SessionDiffPanelInner {...props} />
    </DiffPanelBoundary>
  )
}

function SessionDiffPanelInner({ sessionId }: Props) {
  const insets = useSafeAreaInsets()
  const theme = useTheme()
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<ExpandedMap>({})
  const [lineCap, setLineCap] = useState<LineCapMap>({})
  const parsedRowsCacheRef = useRef<Map<string, DiffLine[]>>(new Map())

  const session = useSessions((s) => (sessionId ? s.sessions.find((item) => item.id === sessionId) : undefined))
  const diffs = useDiffs((s) => (sessionId ? (s.bySession[sessionId] ?? EMPTY_DIFFS) : EMPTY_DIFFS))
  const loading = useDiffs((s) => (sessionId ? (s.loading[sessionId] ?? false) : false))
  const fetchSessionDiff = useDiffs((s) => s.fetchSessionDiff)
  const diffSummary = useSessionDiffSummary(sessionId ?? "", { includeSynthetic: true })

  useEffect(() => {
    if (!sessionId) return
    telemetry.track("diff", "diff:panel:open", { sessionId })
    void fetchSessionDiff(sessionId)
  }, [fetchSessionDiff, sessionId])

  const apiDiffs = useMemo(() => normalizeDiffList(diffs, EMPTY_DIFFS), [diffs])

  const merged = useMemo(
    () => dedupeDiffs([...apiDiffs, ...diffSummary.historyDiffs, ...diffSummary.syntheticDiffs]),
    [apiDiffs, diffSummary.historyDiffs, diffSummary.syntheticDiffs],
  )

  const summaryFromDiffs = useMemo(() => computeSummary(merged), [merged])
  const summary = useMemo(
    () => ({
      files: Math.max(summaryFromDiffs.files, Math.max(0, asNumber(session?.summary?.files))),
      additions: Math.max(summaryFromDiffs.additions, Math.max(0, asNumber(session?.summary?.additions))),
      deletions: Math.max(summaryFromDiffs.deletions, Math.max(0, asNumber(session?.summary?.deletions))),
    }),
    [summaryFromDiffs, session?.summary?.files, session?.summary?.additions, session?.summary?.deletions],
  )

  const normalizedQuery = query.trim().toLowerCase()
  const filteredDiffs = useMemo(() => {
    if (!normalizedQuery) return merged
    return merged.filter((item) => item.file.toLowerCase().includes(normalizedQuery))
  }, [merged, normalizedQuery])

  useEffect(() => {
    const validKeys = new Set(merged.map(diffCacheKey))
    const cache = parsedRowsCacheRef.current
    for (const key of [...cache.keys()]) {
      if (!validKeys.has(key)) cache.delete(key)
    }
  }, [merged])

  // Reset state when session changes
  useEffect(() => {
    setQuery("")
    setExpanded({})
    setLineCap({})
    parsedRowsCacheRef.current.clear()
  }, [sessionId])

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
    if (!sessionId) return
    telemetry.track("diff", "diff:refresh", { sessionId })
    void fetchSessionDiff(sessionId, { force: true })
  }, [fetchSessionDiff, sessionId])

  const toggleFile = useCallback((file: string) => {
    setExpanded((prev) => {
      const opening = !prev[file]
      telemetry.track("diff", "diff:file:toggle", { file, opening })
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
      const parsedRows = isExpanded ? getParsedRows(item) : EMPTY_LINES
      const cap = lineCap[item.file] ?? INITIAL_LINE_CAP
      const visibleRows = isExpanded ? parsedRows.slice(0, cap) : EMPTY_LINES
      const remaining = Math.max(0, parsedRows.length - cap)

      return (
        <View style={[styles.fileCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          <Pressable style={styles.fileHeader} onPress={() => toggleFile(item.file)}>
            <View style={styles.fileHeadMain}>
              <Text style={[styles.filePath, { color: theme.colors.text }]} numberOfLines={1}>
                {item.file}
              </Text>
              <View style={styles.fileMeta}>
                <StatusBadge
                  status={statusOf(item)}
                  successColor={theme.colors.success}
                  errorColor={theme.colors.error}
                  tertiaryColor={theme.colors.textTertiary}
                />
                <Text style={[styles.fileCountPlus, { color: theme.colors.success }]}>+{item.additions}</Text>
                <Text style={[styles.fileCountMinus, { color: theme.colors.error }]}>-{item.deletions}</Text>
              </View>
            </View>
            <FeatherIcon
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={theme.colors.textTertiary}
            />
          </Pressable>
          {isExpanded ? (
            <View style={[styles.rowsWrap, { borderTopColor: theme.colors.borderSubtle }]}>
              {visibleRows.map((line, index) => (
                <DiffLineRow
                  key={`${item.file}:${index}`}
                  line={line}
                  successColor={theme.colors.success}
                  errorColor={theme.colors.error}
                  tertiaryColor={theme.colors.textTertiary}
                  textColor={theme.colors.text}
                />
              ))}
              {remaining > 0 ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.loadMoreBtn,
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
    [
      expanded,
      getParsedRows,
      lineCap,
      loadMore,
      theme.colors.border,
      theme.colors.error,
      theme.colors.success,
      theme.colors.surface,
      theme.colors.text,
      theme.colors.textTertiary,
      theme.colors.borderSubtle,
      theme.colors.surfaceRaised,
      theme.colors.textSecondary,
      toggleFile,
    ],
  )

  const hasNoChanges = merged.length === 0 && !loading

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
        <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
          {session?.title?.trim() || "Session changes"}
        </Text>
        {!hasNoChanges ? (
          <View style={styles.chips}>
            <SummaryChip
              label="files"
              value={`${summary.files}`}
              borderColor={theme.colors.border}
              backgroundColor={theme.colors.surface}
              textColor={theme.colors.text}
              tertiaryColor={theme.colors.textTertiary}
            />
            <SummaryChip
              label="added"
              value={`+${summary.additions}`}
              valueColor={theme.colors.success}
              borderColor={theme.colors.border}
              backgroundColor={theme.colors.surface}
              textColor={theme.colors.text}
              tertiaryColor={theme.colors.textTertiary}
            />
            <SummaryChip
              label="removed"
              value={`-${summary.deletions}`}
              valueColor={theme.colors.error}
              borderColor={theme.colors.border}
              backgroundColor={theme.colors.surface}
              textColor={theme.colors.text}
              tertiaryColor={theme.colors.textTertiary}
            />
          </View>
        ) : null}
      </View>

      {hasNoChanges ? (
        <View style={styles.emptyContainer}>
          <FeatherIcon name="file-text" size={32} color={theme.colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.colors.textSecondary }]}>No changes yet</Text>
          <Text style={[styles.emptySubtitle, { color: theme.colors.textTertiary }]}>
            File changes will appear here as the session progresses.
          </Text>
        </View>
      ) : (
        <FlashList
          data={filteredDiffs}
          renderItem={renderFile}
          keyExtractor={diffKeyExtractor}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View
                style={[styles.searchWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
              >
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
              {filteredDiffs.length === 0 && normalizedQuery ? (
                <View style={styles.emptySearch}>
                  <Text style={[styles.emptySearchText, { color: theme.colors.textTertiary }]}>
                    No files match your search.
                  </Text>
                </View>
              ) : null}
            </View>
          }
          ListFooterComponent={<View style={{ height: Math.max(insets.bottom + 16, 28) }} />}
          refreshing={loading}
          onRefresh={onRefresh}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  )
}

const StatusBadge = memo(function StatusBadge({
  status,
  successColor,
  errorColor,
  tertiaryColor,
}: {
  status: string
  successColor: string
  errorColor: string
  tertiaryColor: string
}) {
  const color = status === "added" ? successColor : status === "deleted" ? errorColor : tertiaryColor
  return (
    <View style={[styles.statusBadge, { borderColor: color }]}>
      <Text style={[styles.statusText, { color }]}>{status}</Text>
    </View>
  )
})

const SummaryChip = memo(function SummaryChip({
  label,
  value,
  valueColor,
  borderColor,
  backgroundColor,
  textColor,
  tertiaryColor,
}: {
  label: string
  value: string
  valueColor?: string
  borderColor: string
  backgroundColor: string
  textColor: string
  tertiaryColor: string
}) {
  return (
    <View style={[styles.summaryChip, { borderColor, backgroundColor }]}>
      <Text style={[styles.summaryValue, { color: valueColor ?? textColor }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: tertiaryColor }]}>{label}</Text>
    </View>
  )
})

const DiffLineRow = memo(function DiffLineRow({
  line,
  successColor,
  errorColor,
  tertiaryColor,
  textColor,
}: {
  line: DiffLine
  successColor: string
  errorColor: string
  tertiaryColor: string
  textColor: string
}) {
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
  const color =
    line.type === "added"
      ? successColor
      : line.type === "removed"
        ? errorColor
        : line.type === "meta"
          ? tertiaryColor
          : textColor

  return (
    <View style={rowStyle}>
      <Text style={[styles.lineNo, { color: tertiaryColor }]}>{line.leftLineNo ?? ""}</Text>
      <Text style={[styles.lineNo, { color: tertiaryColor }]}>{line.rightLineNo ?? ""}</Text>
      <Text style={[styles.lineText, { color }]}>{line.text || " "}</Text>
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
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
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  lineText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  loadMoreBtn: {
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
  pressed: {
    opacity: 0.65,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  emptySearch: {
    alignItems: "center",
    paddingVertical: 24,
  },
  emptySearchText: {
    fontSize: 14,
    textAlign: "center",
  },
})
