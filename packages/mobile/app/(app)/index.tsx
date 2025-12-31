import { useEffect, useState, useCallback, useMemo } from "react"
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useSessionStore } from "@/store/session"
import { OpenCodeClient } from "@/api/client"
import { useServerStore } from "@/store/server"
import { useProviderStore } from "@/store/provider"

export default function SessionsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const sessions = useSessionStore((s) => s.sessions)
  const setSessions = useSessionStore((s) => s.setSessions)
  const setCurrentSession = useSessionStore((s) => s.setCurrentSession)
  const { baseUrl, directory } = useServerStore()
  const fetchProviders = useProviderStore((s) => s.fetchProviders)
  const [isConnecting, setIsConnecting] = useState(true)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  const client = useMemo(() => new OpenCodeClient(baseUrl, directory), [baseUrl, directory])

  const connectAndNavigate = useCallback(async () => {
    setIsConnecting(true)
    setConnectionError(null)

    try {
      const result = await client.testConnection()

      if (!result.connected) {
        setConnectionError(result.error || "Could not connect to server")
        return
      }

      await fetchProviders()

      const sessionList = await client.listSessions()
      setSessions(sessionList)

      if (sessionList.length > 0) {
        const sorted = [...sessionList].sort((a, b) => b.time.updated - a.time.updated)
        setCurrentSession(sorted[0])
        router.replace(`/session/${sorted[0].id}`)
      } else {
        const newSession = await client.createSession()
        setSessions([newSession])
        setCurrentSession(newSession)
        router.replace(`/session/${newSession.id}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred"
      setConnectionError(message)
    } finally {
      setIsConnecting(false)
    }
  }, [client, fetchProviders, setSessions, setCurrentSession, router])

  useEffect(() => {
    connectAndNavigate()
  }, [])

  const handleRetry = () => {
    connectAndNavigate()
  }

  const handleSettings = () => {
    router.push("/settings")
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        {isConnecting ? (
          <>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Connecting to OpenCode...</Text>
          </>
        ) : connectionError ? (
          <>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Connection Failed</Text>
            <Text style={styles.errorText}>{connectionError}</Text>
            <Text style={styles.serverUrl}>Server: {baseUrl}</Text>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.retryButton} onPress={handleRetry} activeOpacity={0.8}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingsButton} onPress={handleSettings} activeOpacity={0.8}>
                <Text style={styles.settingsButtonText}>Settings</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    color: "#888888",
    fontSize: 16,
    marginTop: 16,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 8,
  },
  errorText: {
    color: "#888888",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 8,
  },
  serverUrl: {
    color: "#666666",
    fontSize: 14,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  retryButton: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  settingsButton: {
    backgroundColor: "#1A1A1A",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#333333",
  },
  settingsButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },
})
