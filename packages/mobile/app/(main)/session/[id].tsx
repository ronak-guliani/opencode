import { useEffect, useRef, useMemo, useCallback } from "react"
import { AppState, type AppStateStatus, InteractionManager, View, StyleSheet, Pressable, Text, Alert } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { LinearGradient } from "expo-linear-gradient"
import * as Haptics from "expo-haptics"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useMessages as useMessageStore } from "../../../src/store/messages"
import { useSessions } from "../../../src/store/sessions"
import { useRequests } from "../../../src/store/requests"
import { useConnection } from "../../../src/store/connection"
import { useSidebar } from "../../../src/store/sidebar"
import { useSessionMessages } from "../../../src/api/hooks"
import { useTheme } from "../../../src/theme"
import { ChatProvider } from "../../../src/components/chat/provider"
import { MessagesList } from "../../../src/components/chat/list"
import { Composer } from "../../../src/components/chat/composer"
import { RequestBanner } from "../../../src/components/chat/request-banner"
import { DisableFadeProvider } from "../../../src/animation"
import { markChatFirstPaint, markChatInteractionReady, markChatOpenStart } from "../../../src/perf/chat-metrics"

const REQUEST_POLL_BUSY_MS = 4_000
const REQUEST_POLL_PENDING_MS = 8_000
const REQUEST_POLL_IDLE_MS = 45_000
const TITLE_FADE_WIDTH = 18

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const theme = useTheme()
  const load = useMessageStore((s) => s.load)
  const create = useSessions((s) => s.create)
  const sessions = useSessions((s) => s.sessions)
  const select = useSessions((s) => s.select)
  const refreshRequests = useRequests((s) => s.refresh)
  const permissions = useRequests((s) => s.permissions)
  const questions = useRequests((s) => s.questions)
  const directory = useConnection((s) => s.directory)
  const stream = useConnection((s) => s.stream)
  const switchDirectory = useConnection((s) => s.switchDirectory)
  const requestOpen = useSidebar((s) => s.requestOpen)
  const messages = useSessionMessages(id)
  const sessionStatus = useSessions((s) => (id ? s.statuses[id] : undefined))
  const session = useMemo(() => sessions.find((item) => item.id === id), [sessions, id])
  const title = (session?.title || "").trim() || "Untitled session"
  // Track which sessions have been viewed — disable fade for revisited chats
  const seen = useRef(new Set<string>())
  const wasSeen = id ? seen.current.has(id) : false
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRequestCount = useMemo(() => {
    if (!id) return 0
    const permissionCount = permissions.filter((item) => item.sessionID === id).length
    const questionCount = questions.filter((item) => item.sessionID === id).length
    return permissionCount + questionCount
  }, [id, permissions, questions])
  const isBusy = sessionStatus?.type === "busy"

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const openSidebar = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    requestOpen()
  }, [requestOpen])

  const createSession = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Alert.alert("Session options", "More actions are coming soon.", [
      { text: "Share (soon)" },
      { text: "Export (soon)" },
      { text: "Cancel", style: "cancel" },
    ])
  }, [])

  useEffect(() => {
    if (id) {
      markChatOpenStart(id)
      select(id)
      void load(id, { limit: 60, compact: true })
      // Mark as seen after a short delay to let initial content animate
      const timer = setTimeout(() => seen.current.add(id), 1500)
      const interactionTask = InteractionManager.runAfterInteractions(() => {
        markChatInteractionReady(id)
        void refreshRequests()
      })
      return () => {
        clearTimeout(timer)
        interactionTask.cancel()
      }
    }
  }, [id, load, select, refreshRequests])

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
                paddingTop: insets.top + 8,
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
                  <MenuIcon color={theme.colors.textSecondary} />
                </Pressable>
              </View>

              <View style={styles.titleSlot} pointerEvents="none">
                <View style={styles.titleWrap}>
                  <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1} ellipsizeMode="clip">
                    {title}
                  </Text>
                  <LinearGradient
                    colors={["transparent", theme.colors.background]}
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
                  <ComposeIcon color={theme.colors.textSecondary} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
                  onPress={openOptions}
                  accessibilityRole="button"
                  accessibilityLabel="Session options"
                  hitSlop={8}
                >
                  <EllipsisIcon color={theme.colors.textSecondary} />
                </Pressable>
              </View>
            </View>
          </View>

          <MessagesList sessionId={id} messages={messages} topPadding={12} />
          <RequestBanner sessionId={id} />
          <Composer sessionId={id} />
        </View>
      </DisableFadeProvider>
    </ChatProvider>
  )
}

function MenuIcon({ color }: { color: string }) {
  return (
    <View style={styles.menuIcon}>
      <View style={[styles.menuLine, { backgroundColor: color }]} />
      <View style={[styles.menuLine, styles.menuLineShort, { backgroundColor: color }]} />
    </View>
  )
}

function ComposeIcon({ color }: { color: string }) {
  return (
    <View style={styles.composeIcon}>
      <View style={[styles.composeBox, { borderColor: color }]} />
      <View style={[styles.composePencilShaft, { backgroundColor: color }]} />
      <View style={[styles.composePencilTip, { borderLeftColor: color }]} />
    </View>
  )
}

function EllipsisIcon({ color }: { color: string }) {
  return (
    <View style={styles.ellipsisIcon}>
      <View style={[styles.ellipsisDot, { backgroundColor: color }]} />
      <View style={[styles.ellipsisDot, { backgroundColor: color }]} />
      <View style={[styles.ellipsisDot, { backgroundColor: color }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingBottom: 8,
    position: "relative",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 34,
  },
  sideRail: {
    width: 84,
    flexDirection: "row",
    alignItems: "center",
  },
  sideRailLeft: {
    justifyContent: "flex-start",
  },
  sideRailRight: {
    justifyContent: "flex-end",
    gap: 17,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
    paddingHorizontal: 12,
  },
  titleWrap: {
    width: "100%",
    maxWidth: 260,
    overflow: "hidden",
    alignSelf: "center",
    position: "relative",
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "500",
    textAlign: "center",
    paddingRight: TITLE_FADE_WIDTH,
  },
  titleFade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: TITLE_FADE_WIDTH,
  },
  menuIcon: {
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 4,
  },
  menuLine: {
    height: 1.4,
    borderRadius: 2,
    width: 16,
  },
  menuLineShort: {
    width: 11,
    alignSelf: "flex-end",
  },
  composeIcon: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  composeBox: {
    position: "absolute",
    left: 1.2,
    bottom: 1.2,
    width: 10.8,
    height: 10.8,
    borderWidth: 1.2,
    borderRadius: 2.4,
  },
  composePencilShaft: {
    position: "absolute",
    right: 0.6,
    top: 1.2,
    width: 9,
    height: 1.4,
    borderRadius: 1,
    transform: [{ rotate: "-38deg" }],
  },
  composePencilTip: {
    position: "absolute",
    right: 6.8,
    top: 4.9,
    width: 0,
    height: 0,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderRightWidth: 0,
    borderLeftWidth: 2.4,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    transform: [{ rotate: "-38deg" }],
  },
  ellipsisIcon: {
    width: 16,
    height: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2.5,
  },
  ellipsisDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
  },
})
