import { View, Pressable, Text } from "react-native"
import { router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StyleSheet } from "react-native-unistyles"
import { Header } from "./header"
import { SessionGroup } from "./session-group"
import { useSessions } from "@/api/hooks"
import { relativeGroup } from "@/util/format"
import type { Session } from "@opencode-ai/sdk/client"
import { LegendList } from "@legendapp/list"
import { useCallback, useMemo } from "react"
import { useSessionStore } from "@/store/sessions"

type ListItem = { type: "header"; label: string } | { type: "session"; session: Session }

/**
 * Sidebar container — project header + session list grouped by date.
 * Uses LegendList for performant rendering of potentially long session lists.
 */
export function Sidebar() {
  const insets = useSafeAreaInsets()
  const sessions = useSessions()

  const items = useMemo(() => {
    // Sessions are sorted by ID (ULID = time-ordered ascending).
    // We want newest first for the sidebar, so reverse.
    const reversed = [...sessions].reverse()
    const result: ListItem[] = []
    let group = ""

    for (const session of reversed) {
      const label = relativeGroup(session.time.updated)
      if (label !== group) {
        group = label
        result.push({ type: "header", label })
      }
      result.push({ type: "session", session })
    }

    return result
  }, [sessions])

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === "header") {
      return <SessionGroup label={item.label} />
    }
    return <SessionItem session={item.session} />
  }, [])

  const keyExtractor = useCallback(
    (item: ListItem) => (item.type === "header" ? `h:${item.label}` : item.session.id),
    [],
  )

  function create() {
    router.push("/(main)/session")
    // Close drawer by navigating — expo-router handles this
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header />
      <LegendList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimatedItemSize={52}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        <Pressable style={({ pressed }) => [styles.newButton, pressed && styles.pressed]} onPress={create}>
          <Text style={styles.newButtonText}>+ New Session</Text>
        </Pressable>
      </View>
    </View>
  )
}

import { SessionItem } from "./session-item"

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  list: {
    paddingHorizontal: theme.spacing.sm,
  },
  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  newButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
  },
  pressed: {
    opacity: 0.85,
  },
  newButtonText: {
    color: theme.colors.accentText,
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.semibold,
  },
}))
