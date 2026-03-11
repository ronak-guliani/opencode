import { memo, useCallback, useMemo, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import Feather from "@expo/vector-icons/Feather"
import type { DiffSummary, SessionFileDiff } from "../../features/diff/types"
import { useTheme } from "../../theme"
import {
  buildDiffIndicatorSegments,
  formatModifiedLabel,
  resolveDiffSummary,
  shouldOpenDiffFromHeader,
} from "./diff-summary-card.logic"

const FeatherIcon = Feather as unknown as React.ComponentType<{ name: string; size: number; color: string }>
const EMPTY_DIFFS: SessionFileDiff[] = []

type Props = {
  diffs?: SessionFileDiff[] | null
  summary?: DiffSummary | null
  isUpdating?: boolean
  mode?: "turn" | "session"
  title?: string
  onOpenDiff: () => void
}

export const DiffSummaryCard = memo(function DiffSummaryCard({ diffs, summary, isUpdating = false, mode, title, onOpenDiff }: Props) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)
  const safeDiffs = useMemo(() => (Array.isArray(diffs) ? diffs.filter((item) => !!item?.file) : EMPTY_DIFFS), [diffs])
  const safeSummary = useMemo(() => resolveDiffSummary(safeDiffs, summary), [safeDiffs, summary])
  const indicatorSegments = useMemo(
    () => buildDiffIndicatorSegments(safeSummary.additions, safeSummary.deletions),
    [safeSummary.additions, safeSummary.deletions],
  )
  const headerLabel = useMemo(() => formatModifiedLabel(safeSummary.files), [safeSummary.files])
  const openFromHeader = useMemo(() => shouldOpenDiffFromHeader(safeDiffs), [safeDiffs])
  const resolvedMode = useMemo(() => {
    if (mode) return mode
    const label = (title || "").toLowerCase()
    if (label.includes("turn")) return "turn"
    if (label.includes("session")) return "session"
    return null
  }, [mode, title])
  const modeCaption =
    resolvedMode === "turn"
      ? "Only changes made in this response"
      : resolvedMode === "session"
        ? "All changes accumulated in this chat"
        : ""

  const handleHeaderPress = useCallback(() => {
    if (openFromHeader) {
      onOpenDiff()
      return
    }
    setExpanded((current) => !current)
  }, [onOpenDiff, openFromHeader])

  const handleRowPress = useCallback(() => {
    onOpenDiff()
  }, [onOpenDiff])

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderSubtle }]}>
        <Pressable
          onPress={handleHeaderPress}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Collapse diff summary" : "Expand diff summary"}
        >
          <View style={styles.headerContent}>
            <View style={styles.labelRow}>
              <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
                {headerLabel}
              </Text>
              {indicatorSegments.length > 0 ? (
                <View style={styles.indicator} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {indicatorSegments.map((tone, index) => (
                    <View
                      key={`${tone}-${index}`}
                      style={[
                        styles.indicatorBar,
                        {
                          backgroundColor: tone === "success" ? theme.colors.success : theme.colors.error,
                        },
                      ]}
                    />
                  ))}
                </View>
              ) : null}
            </View>
            {!openFromHeader ? (
              <FeatherIcon
                name={expanded ? "chevron-down" : "chevron-right"}
                size={16}
                color={theme.colors.textTertiary}
              />
            ) : (
              <Text style={[styles.headerMeta, { color: theme.colors.textTertiary }]}>{isUpdating ? "Updating..." : "View diff"}</Text>
            )}
          </View>
          {modeCaption ? (
            <Text style={[styles.caption, { color: theme.colors.textTertiary }]} numberOfLines={1}>
              {modeCaption}
            </Text>
          ) : null}
        </Pressable>

        {expanded && safeDiffs.length > 0 ? (
          <View style={[styles.rows, { borderColor: theme.colors.border }]}>
            {safeDiffs.map((diff, index) => (
              <Pressable
                key={diff.file}
                onPress={handleRowPress}
                style={({ pressed }) => [
                  styles.row,
                  index < safeDiffs.length - 1 && styles.rowBorder,
                  { borderColor: theme.colors.border },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Open diff for ${diff.file}`}
              >
                <Text style={[styles.path, { color: theme.colors.text }]} numberOfLines={1}>
                  {diff.file}
                </Text>
                <View style={styles.rowRight}>
                  <View style={styles.counts}>
                    <Text style={[styles.additions, { color: theme.colors.success }]}>+{Math.max(0, diff.additions)}</Text>
                    <Text style={[styles.deletions, { color: theme.colors.error }]}>-{Math.max(0, diff.deletions)}</Text>
                  </View>
                  <FeatherIcon name="chevron-right" size={15} color={theme.colors.textTertiary} />
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
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
    borderRadius: 14,
    overflow: "hidden",
  },
  headerButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    flexShrink: 1,
  },
  headerMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  caption: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
  },
  indicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  indicatorBar: {
    width: 4,
    height: 28,
    borderRadius: 999,
  },
  rows: {
    marginHorizontal: 10,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  path: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  counts: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  additions: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  deletions: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.72,
  },
})
