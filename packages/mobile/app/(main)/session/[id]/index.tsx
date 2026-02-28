import { useEffect, useRef, useMemo, useCallback } from "react"
import { AppState, type AppStateStatus, InteractionManager, View, StyleSheet, Pressable, Text, Alert } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import Feather from "@expo/vector-icons/Feather"
import { LinearGradient } from "expo-linear-gradient"
import * as Haptics from "expo-haptics"
import * as Clipboard from "expo-clipboard"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useMessages as useMessageStore } from "../../../../src/store/messages"
import { useSessions } from "../../../../src/store/sessions"
import { useRequests } from "../../../../src/store/requests"
import { useConnection } from "../../../../src/store/connection"
import { useSidebar } from "../../../../src/store/sidebar"
import { useSessionMessages } from "../../../../src/api/hooks"
import { useTheme } from "../../../../src/theme"
import { ChatProvider } from "../../../../src/components/chat/provider"
import { MessagesList } from "../../../../src/components/chat/list"
import { Composer } from "../../../../src/components/chat/composer"
import { RequestBanner } from "../../../../src/components/chat/request-banner"
import { MessageSkeleton } from "../../../../src/components/skeleton"
import { DisableFadeProvider } from "../../../../src/animation"
import { markChatFirstPaint, markChatInteractionReady, markChatOpenStart } from "../../../../src/perf/chat-metrics"
import { addCrashBreadcrumb, readCrashBreadcrumbs } from "../../../../src/perf/crash-breadcrumbs"

const FeatherIcon = Feather as unknown as React.ComponentType<{ name: string; size: number; color: string }>
const REQUEST_POLL_BUSY_MS = 4_000
const REQUEST_POLL_PENDING_MS = 8_000
const REQUEST_POLL_IDLE_MS = 45_000
const MESSAGE_RESYNC_BUSY_MS = 3_000
const MESSAGE_RESYNC_IDLE_MS = 12_000
const SESSION_OPEN_LIMIT = 24
const SESSION_PREFETCH_DELAY_MS = 550
const SESSION_PREFETCH_NEIGHBORS = 2
const SESSION_PREFETCH_LIMIT = 10
const TITLE_FADE_WIDTH = 22

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const theme = useTheme()
  const load = useMessageStore((s) => s.load)
  const prefetch = useMessageStore((s) => s.prefetch)
  const loadingMessages = useMessageStore((s) => (id ? (s.loading[id] ?? false) : false))
  const create = useSessions((s) => s.create)
  const session = useSessions((s) => (id ? s.sessions.find((item) => item.id === id) : undefined))
  const select = useSessions((s) => s.select)
  const refreshRequests = useRequests((s) => s.refresh)
  const pendingRequestCount = useRequests((s) => {
    if (!id) return 0
    let total = 0
    for (const permission of s.permissions) {
      if (permission.sessionID === id) total += 1
    }
    for (const question of s.questions) {
      if (question.sessionID === id) total += 1
    }
    return total
  })
  const directory = useConnection((s) => s.directory)
  const stream = useConnection((s) => s.stream)
  const switchDirectory = useConnection((s) => s.switchDirectory)
  const requestOpen = useSidebar((s) => s.requestOpen)
  const messages = useSessionMessages(id)
  const sessionStatus = useSessions((s) => (id ? s.statuses[id] : undefined))
  const title = (session?.title || "").trim() || "Untitled session"
  const titleFadeStart = useMemo(() => withAlpha(theme.colors.background, "00"), [theme.colors.background])
  // Track which sessions have been viewed — disable fade for revisited chats
  const seen = useRef(new Set<string>())
  const wasSeen = id ? seen.current.has(id) : false
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isBusy = sessionStatus?.type === "busy"

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const openSidebar = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    requestOpen()
  }, [requestOpen])

  const createSession = useCallback(async () => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      if (session?.directory && session.directory !== directory) {
        await switchDirectory(session.directory)
      }
      const next = await create()
      select(next.id)
      router.replace(`/(main)/session/${next.id}`)
    } catch {
      Alert.alert("Unable to create session", "Please try again.")
    }
  }, [session?.directory, directory, switchDirectory, create, select, router])

  const openOptions = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const actions = [
      { text: "Share (soon)" },
      { text: "Export (soon)" },
      {
        text: "Copy Debug Breadcrumbs",
        onPress: () => {
          const payload = {
            sessionID: id,
            copiedAt: new Date().toISOString(),
            breadcrumbs: readCrashBreadcrumbs(),
          }
          void Clipboard.setStringAsync(JSON.stringify(payload, null, 2))
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          Alert.alert("Copied", "Debug breadcrumbs copied to clipboard.")
        },
      },
      { text: "Cancel", style: "cancel" },
    ] as Array<{ text: string; style?: "cancel"; onPress?: () => void }>

    Alert.alert("Session options", "More actions are coming soon.", actions)
  }, [id])

  useEffect(() => {
    if (id) {
      addCrashBreadcrumb("session-screen:open", {
        sessionID: id,
      })
      markChatOpenStart(id)
      select(id)
      void load(id, { limit: SESSION_OPEN_LIMIT, compact: true })
      addCrashBreadcrumb("session-screen:load", { sessionID: id, limit: SESSION_OPEN_LIMIT })
      // Mark as seen after a short delay to let initial content animate
      const timer = setTimeout(() => seen.current.add(id), 1500)
      const interactionTask = InteractionManager.runAfterInteractions(() => {
        markChatInteractionReady(id)
        void refreshRequests()
        addCrashBreadcrumb("session-screen:interaction-ready", { sessionID: id })
      })
      return () => {
        addCrashBreadcrumb("session-screen:cleanup", { sessionID: id })
        clearTimeout(timer)
        interactionTask.cancel()
      }
    }
  }, [id, load, refreshRequests, select])

  useEffect(() => {
    if (!id) return
    let timeout: ReturnType<typeof setTimeout> | null = null
    const task = InteractionManager.runAfterInteractions(() => {
      timeout = setTimeout(() => {
        const allSessions = useSessions.getState().sessions
        const current = allSessions.find((item) => item.id === id)
        if (!current?.directory) return
        const neighbors = allSessions
          .filter((item) => item.directory === current.directory && item.id !== id)
          .slice(0, SESSION_PREFETCH_NEIGHBORS)
          .map((item) => item.id)
        if (neighbors.length === 0) return
        addCrashBreadcrumb("session-screen:prefetch-neighbors", {
          sessionID: id,
          count: neighbors.length,
          limit: SESSION_PREFETCH_LIMIT,
        })
        void prefetch(neighbors, { limit: SESSION_PREFETCH_LIMIT })
      }, SESSION_PREFETCH_DELAY_MS)
    })

    return () => {
      task.cancel()
      if (timeout) clearTimeout(timeout)
    }
  }, [id, prefetch])

  useEffect(() => {
    if (!id) return

    let cancelled = false

    const pollOnceAndSchedule = async () => {
      if (cancelled || appStateRef.current !== "active") return
      try {
        await refreshRequests()
      } catch {
        // ignore
      }
      if (cancelled || appStateRef.current !== "active") return

      const interval = isBusy
        ? REQUEST_POLL_BUSY_MS
        : pendingRequestCount > 0
          ? REQUEST_POLL_PENDING_MS
          : REQUEST_POLL_IDLE_MS

      pollTimerRef.current = setTimeout(() => {
        void pollOnceAndSchedule()
      }, interval)
    }

    clearPollTimer()
    void pollOnceAndSchedule()

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState
      if (nextState === "active") {
        clearPollTimer()
        void pollOnceAndSchedule()
      } else {
        clearPollTimer()
      }
    })

    return () => {
      cancelled = true
      appStateSubscription.remove()
      clearPollTimer()
    }
  }, [id, clearPollTimer, isBusy, pendingRequestCount, refreshRequests])

  useEffect(() => {
    if (!id || stream !== "connected") return
    void refreshRequests()
  }, [id, stream, refreshRequests])

  useEffect(() => {
    if (!id) return
    if (stream === "connected") return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const sync = async () => {
      if (cancelled || appStateRef.current !== "active") return
      try {
        await load(id, { force: true, limit: SESSION_OPEN_LIMIT, compact: true })
      } catch {
        // ignore
      }

      if (cancelled || appStateRef.current !== "active") return
      timer = setTimeout(() => {
        void sync()
      }, isBusy ? MESSAGE_RESYNC_BUSY_MS : MESSAGE_RESYNC_IDLE_MS)
    }

    void sync()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [id, isBusy, load, stream])

  useEffect(() => {
    if (!id || messages.length === 0) return
    const frame = requestAnimationFrame(() => {
      markChatFirstPaint(id, messages.length)
    })
    return () => cancelAnimationFrame(frame)
  }, [id, messages.length])

  if (!id) return null

  return (
    <ChatProvider>
      <DisableFadeProvider disabled={wasSeen}>
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
          <View
            style={[
              styles.header,
              {
                paddingTop: insets.top + 12,
                backgroundColor: theme.colors.background,
                borderBottomColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.headerRow}>
              <View style={[styles.sideRail, styles.sideRailLeft]}>
                <Pressable
                  style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
                  onPress={openSidebar}
                  accessibilityRole="button"
                  accessibilityLabel="Open sidebar"
                  hitSlop={8}
                >
                  <FeatherIcon name="menu" size={18} color={theme.colors.text} />
                </Pressable>
              </View>

              <View style={styles.titleSlot} pointerEvents="none">
                <View style={styles.titleWrap}>
                  <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1} ellipsizeMode="tail">
                    {title}
                  </Text>
                  <LinearGradient
                    colors={[titleFadeStart, theme.colors.background]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.titleFade}
                    pointerEvents="none"
                  />
                </View>
              </View>

              <View style={[styles.sideRail, styles.sideRailRight]}>
                <Pressable
                  style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
                  onPress={() => void createSession()}
                  accessibilityRole="button"
                  accessibilityLabel="New session"
                  hitSlop={8}
                >
                  <FeatherIcon name="edit-3" size={17} color={theme.colors.text} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
                  onPress={openOptions}
                  accessibilityRole="button"
                  accessibilityLabel="Session options"
                  hitSlop={8}
                >
                  <FeatherIcon name="more-horizontal" size={18} color={theme.colors.text} />
                </Pressable>
              </View>
            </View>
          </View>

          {messages.length === 0 && loadingMessages ? (
            <View style={styles.loadingState}>
              <MessageSkeleton />
              <MessageSkeleton />
              <MessageSkeleton />
            </View>
          ) : (
            <MessagesList sessionId={id} messages={messages} topPadding={16} />
          )}
          <RequestBanner sessionId={id} />
          <Composer sessionId={id} />
        </View>
      </DisableFadeProvider>
    </ChatProvider>
  )
}

function withAlpha(color: string, alpha: string) {
  if (!color.startsWith("#") || color.length !== 7) return color
  return `${color}${alpha}`
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingBottom: 10,
    position: "relative",
    zIndex: 20,
    elevation: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 38,
  },
  sideRail: {
    width: 74,
    flexDirection: "row",
    alignItems: "center",
  },
  sideRailLeft: {
    justifyContent: "flex-start",
  },
  sideRailRight: {
    justifyContent: "flex-end",
    gap: 14,
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonPressed: {
    opacity: 0.55,
  },
  titleSlot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  titleWrap: {
    width: "100%",
    maxWidth: 280,
    overflow: "hidden",
    alignSelf: "center",
    position: "relative",
  },
  title: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "500",
    textAlign: "center",
    paddingRight: TITLE_FADE_WIDTH,
    paddingLeft: 2,
  },
  titleFade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: TITLE_FADE_WIDTH,
  },
  loadingState: {
    flex: 1,
    paddingTop: 22,
    paddingHorizontal: 4,
    gap: 2,
  },
})
