import { useEffect, useRef, useCallback } from "react"
import { View, Text, ActivityIndicator } from "react-native"
import { Drawer } from "expo-router/drawer"
import { StyleSheet } from "react-native-unistyles"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { Sidebar } from "@/components/sidebar"
import { useConnectionStore } from "@/store/connection"
import { createClient, getClient } from "@/api/client"
import { bootstrap } from "@/api/bootstrap"
import { subscribe } from "@/api/events"
import { useBootstrapStatus } from "@/api/hooks"

/**
 * Main layout — Drawer navigator wrapping sidebar + content.
 *
 * On mount:
 * 1. Creates the SDK client from persisted credentials
 * 2. Runs two-phase bootstrap (project, config, providers → sessions)
 * 3. Starts SSE subscription for real-time updates
 *
 * Shows a loading spinner until Phase 1 bootstrap completes.
 */
export default function MainLayout() {
  const cleanup = useRef<(() => void) | null>(null)
  const status = useBootstrapStatus()

  useEffect(() => {
    const url = useConnectionStore.getState().url
    if (!url) return

    const client = createClient(url)

    void bootstrap(client).then((ok) => {
      if (!ok) return
      cleanup.current = subscribe(client)
    })

    return () => {
      cleanup.current?.()
      cleanup.current = null
    }
  }, [])

  const sidebar = useCallback(() => <Sidebar />, [])

  if (status === "loading") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Connecting...</Text>
      </View>
    )
  }

  return (
    <Drawer
      drawerContent={sidebar}
      screenOptions={{
        headerShown: false,
        drawerType: "slide",
        drawerStyle: styles.drawer,
        swipeEdgeWidth: 40,
        swipeMinDistance: 10,
      }}
    >
      <Drawer.Screen name="session/index" options={{ title: "Sessions" }} />
      <Drawer.Screen name="session/[id]" options={{ title: "Chat" }} />
    </Drawer>
  )
}

const styles = StyleSheet.create((theme) => ({
  loading: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing.lg,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.size.md,
  },
  drawer: {
    width: 300,
    backgroundColor: theme.colors.background,
  },
}))
