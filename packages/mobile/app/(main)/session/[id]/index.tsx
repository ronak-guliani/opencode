import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import {
  AppState,
  type AppStateStatus,
  InteractionManager,
  View,
  StyleSheet,
  Pressable,
  Text,
  Alert,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import Feather from "@expo/vector-icons/Feather"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import * as Haptics from "expo-haptics"
import * as Clipboard from "expo-clipboard"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useMessages as useMessageStore } from "../../../../src/store/messages"
import { useSessions } from "../../../../src/store/sessions"
import { useSettings, modelName } from "../../../../src/store/settings"
import { useRequests } from "../../../../src/store/requests"
import { useConnection } from "../../../../src/store/connection"
import { usePendingRequestCount, useSessionMessages, useSessionPartsMap } from "../../../../src/api/hooks"
import { useTheme } from "../../../../src/theme"
import { ChatProvider } from "../../../../src/components/chat/provider"
import { MessagesList } from "../../../../src/components/chat/list"
import { Composer } from "../../../../src/components/chat/composer"
import { RequestBanner } from "../../../../src/components/chat/request-banner"
import { MessageSkeleton } from "../../../../src/components/skeleton"
import { ModelPicker } from "../../../../src/components/model-picker"
import { DisableFadeProvider } from "../../../../src/animation"
import { markChatFirstPaint, markChatInteractionReady, markChatOpenStart } from "../../../../src/perf/chat-metrics"
import { addCrashBreadcrumb, readCrashBreadcrumbs } from "../../../../src/perf/crash-breadcrumbs"
import { telemetry } from "../../../../src/perf/telemetry"
import { resolveLatestTodoSnapshot } from "../../../../src/components/chat/part"

const FeatherIcon = Feather as unknown as React.ComponentType<{ name: string; size: number; color: string }>
const REQUEST_POLL_BUSY_MS = 4_000
const REQUEST_POLL_PENDING_MS = 8_000
const REQUEST_POLL_IDLE_MS = 45_000
const MESSAGE_RESYNC_BUSY_MS = 3_000
const MESSAGE_RESYNC_IDLE_MS = 12_000
const LOADING_SKELETON_DELAY_MS = 140
const SESSION_OPEN_LIMIT = 24
const SESSION_PREFETCH_DELAY_MS = 550
const SESSION_PREFETCH_NEIGHBORS = 2
const SESSION_PREFETCH_LIMIT = 10
const MaterialIcon = MaterialCommunityIcons as unknown as React.ComponentType<{
  name: string
  size: number
  color: string
  style?: unknown
}>

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const theme = useTheme()
  const load = useMessageStore((s) => s.load)
  const prefetch = useMessageStore((s) => s.prefetch)
  const loadingMessages = useMessageStore((s) => (id ? (s.loading[id] ?? false) : false))
  const loadedAt = useMessageStore((s) => (id ? (s.loadedAt[id] ?? 0) : 0))
  const session = useSessions((s) => (id ? s.sessions.find((item) => item.id === id) : undefined))
  const select = useSessions((s) => s.select)
  const refreshRequests = useRequests((s) => s.refresh)
  const pendingRequestCount = usePendingRequestCount(id)
  const directory = useConnection((s) => s.directory)
  const stream = useConnection((s) => s.stream)
  const switchDirectory = useConnection((s) => s.switchDirectory)
  const activeModel = useSettings(modelName)
  const fetchProviders = useSettings((s) => s.fetchProviders)
  const messages = useSessionMessages(id)
  const partsByMessage = useSessionPartsMap(id)
  const sessionStatus = useSessions((s) => (id ? s.statuses[id] : undefined))
  const title = (session?.title || "").trim() || "Untitled session"
  const titleLimit = Math.max(14, Math.min(34, 36 - Math.floor(activeModel.trim().length * 0.75)))
  const shortTitle = title.length > titleLimit ? `${title.slice(0, titleLimit).trimEnd()}…` : title
  const [pickerVisible, setPickerVisible] = useState(false)
  const [showLoadingSkeleton, setShowLoadingSkeleton] = useState(false)
  // Track which sessions have been viewed — disable fade for revisited chats
  const seen = useRef(new Set<string>())
  const wasSeen = id ? seen.current.has(id) : false
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstPaintedRef = useRef<string | null>(null)
  const isBusy = sessionStatus?.type === "busy"
  const isBusyRef = useRef(isBusy)
  isBusyRef.current = isBusy
  const pendingCountRef = useRef(pendingRequestCount)
  pendingCountRef.current = pendingRequestCount
  const shouldShowLoadingState = messages.length === 0 && (loadingMessages || loadedAt === 0)
  const pinnedTodo = useMemo(() => {
    if (isBusy) return null

    let end = -1
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const candidate = messages[i]
      if (!candidate || candidate.role !== "assistant") continue
      end = i
      break
    }

    if (end < 0) return null

    let start = end
    while (start > 0 && messages[start - 1]?.role === "assistant") {
      start -= 1
    }

    const tail = messages[end]
    const live = !!(tail && "completed" in tail.time ? !tail.time.completed : true)
    for (let i = end; i >= start; i -= 1) {
      const candidate = messages[i]
      if (!candidate || candidate.role !== "assistant") continue
      const snapshot = resolveLatestTodoSnapshot(partsByMessage[candidate.id] ?? [])
      if (snapshot) return { snapshot, live }
    }

    return null
  }, [isBusy, messages, partsByMessage])

  useEffect(() => {
    if (!shouldShowLoadingState) {
      setShowLoadingSkeleton(false)
      return
    }
    const timer = setTimeout(() => {
      setShowLoadingSkeleton(true)
    }, LOADING_SKELETON_DELAY_MS)
    return () => clearTimeout(timer)
  }, [shouldShowLoadingState])

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const createSession = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    try {
      if (session?.directory && session.directory !== directory) {
        await switchDirectory(session.directory)
      }
      select(null)
      router.replace("/(main)/session")
    } catch {
      Alert.alert("Unable to start session", "Please try again.")
    }
  }, [session?.directory, directory, switchDirectory, select, router])

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

  const openModelPicker = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void fetchProviders()
    setPickerVisible(true)
  }, [fetchProviders])

  useEffect(() => {
    if (!id) return
    telemetry.track("session", "session:screen:open", { sessionID: id })
    addCrashBreadcrumb("session-screen:open", { sessionID: id })
    markChatOpenStart(id)
    select(id)

    // Reset the first-paint ref so it fires again for a new session
    if (firstPaintedRef.current !== id) firstPaintedRef.current = null

    const sessionDir = useSessions.getState().sessions.find((item) => item.id === id)?.directory
    const needsSwitch = !!sessionDir && sessionDir !== useConnection.getState().directory

    const initSession = async () => {
      if (needsSwitch) {
        addCrashBreadcrumb("session-screen:directory-switch:start", {
          sessionID: id,
          fromDirectory: useConnection.getState().directory,
          toDirectory: sessionDir,
        })
        try {
          await switchDirectory(sessionDir)
          addCrashBreadcrumb("session-screen:directory-switch:done", { sessionID: id, toDirectory: sessionDir })
        } catch (error: unknown) {
          addCrashBreadcrumb(
            "session-screen:directory-switch:error",
            {
              sessionID: id,
              toDirectory: sessionDir,
              message: error instanceof Error ? error.message : String(error),
            },
            "warn",
          )
        }
      }
      void load(id, { limit: SESSION_OPEN_LIMIT, trimToRecent: SESSION_OPEN_LIMIT })
      addCrashBreadcrumb("session-screen:load", { sessionID: id, limit: SESSION_OPEN_LIMIT })
    }

    void initSession()

    const timer = setTimeout(() => seen.current.add(id), 1500)
    const interactionTask = InteractionManager.runAfterInteractions(() => {
      markChatInteractionReady(id)
      void refreshRequests()
      addCrashBreadcrumb("session-screen:interaction-ready", { sessionID: id })
    })
    return () => {
      telemetry.track("session", "session:screen:cleanup", { sessionID: id })
      addCrashBreadcrumb("session-screen:cleanup", { sessionID: id })
      clearTimeout(timer)
      interactionTask.cancel()
    }
  }, [id, load, refreshRequests, select, switchDirectory])

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
    const shouldPoll = stream !== "connected"

    const refreshOnce = async () => {
      if (cancelled || appStateRef.current !== "active") return
      try {
        await refreshRequests()
      } catch {
        // ignore
      }
    }

    const pollOnceAndSchedule = async () => {
      if (cancelled || appStateRef.current !== "active") return
      await refreshOnce()
      if (cancelled || appStateRef.current !== "active") return
      if (!shouldPoll) return

      const interval = isBusyRef.current
        ? REQUEST_POLL_BUSY_MS
        : pendingCountRef.current > 0
          ? REQUEST_POLL_PENDING_MS
          : REQUEST_POLL_IDLE_MS

      pollTimerRef.current = setTimeout(() => {
        void pollOnceAndSchedule()
      }, interval)
    }

    clearPollTimer()
    if (shouldPoll) {
      void pollOnceAndSchedule()
    } else {
      void refreshOnce()
    }

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState
      if (nextState === "active") {
        clearPollTimer()
        if (shouldPoll) {
          void pollOnceAndSchedule()
        } else {
          void refreshOnce()
        }
      } else {
        clearPollTimer()
      }
    })

    return () => {
      cancelled = true
      appStateSubscription.remove()
      clearPollTimer()
    }
  }, [id, clearPollTimer, refreshRequests, stream])

  useEffect(() => {
    if (!id) return
    if (stream === "connected") return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let unchangedSyncs = 0

    const sync = async () => {
      if (cancelled || appStateRef.current !== "active") return
      const before = useMessageStore.getState()
      const beforeLoadedAt = before.loadedAt[id] ?? 0
      const beforeCount = before.messages[id]?.length ?? 0

      try {
        await load(id, { force: true, limit: SESSION_OPEN_LIMIT })
      } catch {
        // ignore
      }

      if (cancelled || appStateRef.current !== "active") return
      const after = useMessageStore.getState()
      const afterLoadedAt = after.loadedAt[id] ?? 0
      const afterCount = after.messages[id]?.length ?? 0
      const changed = afterLoadedAt !== beforeLoadedAt || afterCount !== beforeCount
      if (changed) {
        unchangedSyncs = 0
      } else {
        unchangedSyncs += 1
      }
      const baseDelay = isBusyRef.current ? MESSAGE_RESYNC_BUSY_MS : MESSAGE_RESYNC_IDLE_MS
      const delayMultiplier = Math.min(4, 1 + unchangedSyncs)
      const nextDelay = Math.round(baseDelay * delayMultiplier)
      timer = setTimeout(() => {
        void sync()
      }, nextDelay)
    }

    void sync()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [id, load, stream])

  useEffect(() => {
    if (!id || messages.length === 0) return
    if (firstPaintedRef.current === id) return
    firstPaintedRef.current = id
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
              <Pressable
                style={({ pressed }) => [
                  styles.modelButton,
                  { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
                  pressed && styles.iconButtonPressed,
                ]}
                onPress={openModelPicker}
                accessibilityRole="button"
                accessibilityLabel="Choose model"
              >
                <Text
                  style={[styles.modelLabel, { color: theme.colors.text }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {activeModel}
                </Text>
                <FeatherIcon name="chevron-right" size={13} color={theme.colors.textSecondary} />
              </Pressable>

              <View style={styles.titleSlot}>
                <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1} ellipsizeMode="tail">
                  {shortTitle}
                </Text>
              </View>

              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
                  onPress={() => void createSession()}
                  accessibilityRole="button"
                  accessibilityLabel="New session"
                  hitSlop={8}
                >
                  <MaterialIcon
                    style={styles.composeSymbol}
                    name="square-edit-outline"
                    size={18}
                    color={theme.colors.text}
                  />
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

          {showLoadingSkeleton ? (
            <View style={styles.loadingState}>
              <MessageSkeleton />
              <MessageSkeleton />
              <MessageSkeleton />
            </View>
          ) : (
            <MessagesList sessionId={id} messages={messages} topPadding={16} />
          )}
          <RequestBanner sessionId={id} />
          <Composer sessionId={id} pinnedTodo={pinnedTodo} />
        </View>
        <ModelPicker visible={pickerVisible} onClose={() => setPickerVisible(false)} />
      </DisableFadeProvider>
    </ChatProvider>
  )
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
    minHeight: 40,
    gap: 7,
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
  composeSymbol: {
    marginTop: 0.5,
  },
  modelButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    minHeight: 26,
    maxWidth: 220,
    paddingHorizontal: 7,
    flexShrink: 1,
  },
  modelLabel: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },
  titleSlot: {
    flex: 1,
    justifyContent: "center",
    paddingRight: 2,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "500",
    textAlign: "left",
  },
  loadingState: {
    flex: 1,
    paddingTop: 22,
    paddingHorizontal: 4,
    gap: 2,
  },
})
