import { memo } from "react"
import { View, Text, Pressable } from "react-native"
import { router, usePathname } from "expo-router"
import { StyleSheet } from "react-native-unistyles"
import { useSessionStatus } from "@/api/hooks"
import { relativeTime } from "@/util/format"
import type { Session } from "@opencode-ai/sdk/client"
import { useSessionStore } from "@/store/sessions"

/**
 * Single session row in the sidebar.
 * Shows status indicator dot, title, and relative time.
 * Memoized to avoid re-renders when other sessions update.
 */
export const SessionItem = memo(function SessionItem({ session }: { session: Session }) {
  const status = useSessionStatus(session.id)
  const pathname = usePathname()
  const active = pathname === `/(main)/session/${session.id}`

  function navigate() {
    useSessionStore.getState().select(session.id)
    router.push(`/(main)/session/${session.id}`)
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.container, active && styles.active, pressed && styles.pressed]}
      onPress={navigate}
    >
      <View style={styles.row}>
        <StatusDot type={status?.type ?? "idle"} />
        <Text style={[styles.title, active && styles.titleActive]} numberOfLines={1}>
          {session.title || "New Session"}
        </Text>
      </View>
      <Text style={styles.time}>{relativeTime(session.time.updated)}</Text>
    </Pressable>
  )
})

function StatusDot({ type }: { type: string }) {
  const color = type === "busy" ? "#eab308" : type === "retry" ? "#f97316" : type === "idle" ? "#22c55e" : "#71717a"

  return <View style={[styles.dot, { backgroundColor: color }]} />
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radii.sm,
    marginVertical: 1,
  },
  active: {
    backgroundColor: theme.colors.surfaceRaised,
  },
  pressed: {
    backgroundColor: theme.colors.pressable,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: theme.spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  title: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.text,
    flex: 1,
  },
  titleActive: {
    fontWeight: theme.typography.weight.medium,
  },
  time: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textTertiary,
    marginLeft: theme.spacing.sm,
  },
}))
