import { memo, useMemo } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import type { SessionFileDiff } from "../../features/diff/types"
import { useTheme } from "../../theme"

type Props = {
  diffs: SessionFileDiff[]
  onPress: () => void
}

function basename(path: string) {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

function parentDir(path: string) {
  const parts = path.split(/[\\/]/)
  if (parts.length <= 1) return ""
  return parts[parts.length - 2] || ""
}

export const TurnDiffIndicator = memo(function TurnDiffIndicator({ diffs, onPress }: Props) {
  const theme = useTheme()
  const files = useMemo(() => diffs.filter((d) => !!d.file), [diffs])

  if (files.length === 0) return null

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${files.length} file${files.length === 1 ? "" : "s"} changed`}
    >
      {files.map((diff) => {
        const hasAdd = diff.additions > 0
        const hasDel = diff.deletions > 0
        const dir = parentDir(diff.file)
        const name = basename(diff.file)
        return (
          <View key={diff.file} style={styles.row}>
            <View style={styles.dots}>
              {hasAdd ? <View style={[styles.dot, { backgroundColor: theme.colors.success }]} /> : null}
              {hasDel ? <View style={[styles.dot, { backgroundColor: theme.colors.error }]} /> : null}
              {!hasAdd && !hasDel ? (
                <View style={[styles.dot, { backgroundColor: theme.colors.textTertiary }]} />
              ) : null}
            </View>
            <Text style={[styles.filename, { color: theme.colors.text }]} numberOfLines={1}>
              {dir ? <Text style={{ color: theme.colors.textTertiary }}>{dir}/</Text> : null}
              {name}
            </Text>
          </View>
        )
      })}
    </Pressable>
  )
})

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
    marginTop: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  filename: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    flex: 1,
  },
})
