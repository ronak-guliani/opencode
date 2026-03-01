import { memo, useMemo } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import type { DiffSummary, SessionFileDiff } from "../../features/diff/types"
import { useTheme } from "../../theme"

const MAX_VISIBLE_FILES = 3
const EMPTY_DIFFS: SessionFileDiff[] = []
const ZERO_SUMMARY: DiffSummary = { files: 0, additions: 0, deletions: 0 }

type Props = {
  diffs?: SessionFileDiff[] | null
  summary?: DiffSummary | null
  isUpdating?: boolean
  mode?: "turn" | "session"
  title?: string
  onPress: () => void
}

export const DiffSummaryCard = memo(function DiffSummaryCard({ diffs, summary, isUpdating = false, mode, title, onPress }: Props) {
  const theme = useTheme()
  const safeDiffs = useMemo(() => (Array.isArray(diffs) ? diffs.filter((item) => !!item?.file) : EMPTY_DIFFS), [diffs])
  const summaryFromDiffs = useMemo(() => {
    if (safeDiffs.length === 0) return ZERO_SUMMARY
    return safeDiffs.reduce<DiffSummary>(
      (acc, item) => ({
        files: acc.files + 1,
        additions: acc.additions + Math.max(0, Number.isFinite(item.additions) ? Number(item.additions) : 0),
        deletions: acc.deletions + Math.max(0, Number.isFinite(item.deletions) ? Number(item.deletions) : 0),
      }),
      { files: 0, additions: 0, deletions: 0 },
    )
  }, [safeDiffs])
  const safeSummary = useMemo(
    () => ({
      files: Math.max(
        Number.isFinite(summary?.files) ? Math.max(0, Number(summary?.files)) : ZERO_SUMMARY.files,
        summaryFromDiffs.files,
      ),
      additions: Math.max(
        Number.isFinite(summary?.additions) ? Math.max(0, Number(summary?.additions)) : ZERO_SUMMARY.additions,
        summaryFromDiffs.additions,
      ),
      deletions: Math.max(
        Number.isFinite(summary?.deletions) ? Math.max(0, Number(summary?.deletions)) : ZERO_SUMMARY.deletions,
        summaryFromDiffs.deletions,
      ),
    }),
    [summary?.additions, summary?.deletions, summary?.files, summaryFromDiffs.additions, summaryFromDiffs.deletions, summaryFromDiffs.files],
  )
  const visibleDiffs = useMemo(() => safeDiffs.slice(0, MAX_VISIBLE_FILES), [safeDiffs])
  const hiddenDiffCount = Math.max(0, safeDiffs.length - visibleDiffs.length)
  const resolvedMode = useMemo(() => {
    if (mode) return mode
    const label = (title || "").toLowerCase()
    if (label.includes("turn")) return "turn"
    if (label.includes("session")) return "session"
    return null
  }, [mode, title])
  const modeLabel = resolvedMode === "turn" ? "This Turn" : resolvedMode === "session" ? "Session Total" : title || "Diff"
  const modeHint =
    resolvedMode === "turn"
      ? "Only changes made in this response"
      : resolvedMode === "session"
        ? "All changes accumulated in this chat"
        : ""
  const modeColor = resolvedMode === "turn" ? theme.colors.accent : resolvedMode === "session" ? theme.colors.warning : theme.colors.border
  const totalsLabel = `${safeSummary.files} file${safeSummary.files === 1 ? "" : "s"}  +${safeSummary.additions}  -${safeSummary.deletions}`

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          pressed && styles.pressed,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.borderSubtle,
            borderLeftColor: modeColor,
          },
        ]}
      >
        <View style={styles.head}>
          <View style={[styles.badge, { backgroundColor: theme.colors.surfaceRaised }]}>
            <View style={[styles.badgeDot, { backgroundColor: modeColor }]} />
            <Text style={[styles.title, { color: theme.colors.text }]}>{modeLabel}</Text>
          </View>
          <Text style={[styles.totals, { color: theme.colors.textTertiary }]} numberOfLines={1}>
            {totalsLabel}
          </Text>
        </View>
        {modeHint ? (
          <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>{modeHint}</Text>
        ) : null}
        {visibleDiffs.length > 0 ? (
          <View style={styles.rows}>
            {visibleDiffs.map((diff) => (
              <View key={diff.file} style={styles.row}>
                <Text style={[styles.path, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                  {diff.file}
                </Text>
                <View style={styles.counts}>
                  <Text style={[styles.additions, { color: theme.colors.success }]}>+{Math.max(0, diff.additions)}</Text>
                  <Text style={[styles.deletions, { color: theme.colors.error }]}>-{Math.max(0, diff.deletions)}</Text>
                </View>
              </View>
            ))}
            {hiddenDiffCount > 0 ? (
              <Text style={[styles.more, { color: theme.colors.textTertiary }]}>+{hiddenDiffCount} more files</Text>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.more, { color: theme.colors.textTertiary }]}>{`${safeSummary.files} files changed`}</Text>
        )}

        <View style={styles.footer}>
          <Text style={[styles.caption, { color: theme.colors.textTertiary }]}>
            {isUpdating ? "Updating..." : "View full diff"}
          </Text>
        </View>
      </Pressable>
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 6,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 2,
    borderRadius: 12,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  rows: {
    gap: 6,
  },
  title: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  totals: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    textAlign: "right",
  },
  hint: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  path: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  counts: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  additions: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  deletions: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  more: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  footer: {
    paddingTop: 2,
  },
  caption: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
  },
  pressed: {
    opacity: 0.7,
  },
})
