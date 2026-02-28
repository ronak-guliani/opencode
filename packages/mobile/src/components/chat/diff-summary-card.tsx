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
  onPress: () => void
}

export const DiffSummaryCard = memo(function DiffSummaryCard({ diffs, summary, isUpdating = false, onPress }: Props) {
  const theme = useTheme()
  const safeDiffs = useMemo(() => (Array.isArray(diffs) ? diffs.filter((item) => !!item?.file) : EMPTY_DIFFS), [diffs])
  const safeSummary = useMemo(
    () => ({
      files: Number.isFinite(summary?.files) ? Math.max(0, Number(summary?.files)) : ZERO_SUMMARY.files,
      additions: Number.isFinite(summary?.additions) ? Math.max(0, Number(summary?.additions)) : ZERO_SUMMARY.additions,
      deletions: Number.isFinite(summary?.deletions) ? Math.max(0, Number(summary?.deletions)) : ZERO_SUMMARY.deletions,
    }),
    [summary?.additions, summary?.deletions, summary?.files],
  )
  const visibleDiffs = useMemo(() => safeDiffs.slice(0, MAX_VISIBLE_FILES), [safeDiffs])
  const hiddenDiffCount = Math.max(0, safeDiffs.length - visibleDiffs.length)

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          pressed && styles.pressed,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderSubtle },
        ]}
      >
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
    borderRadius: 12,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rows: {
    gap: 6,
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
