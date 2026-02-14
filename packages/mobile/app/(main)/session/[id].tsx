import { useEffect, useRef, useState, useMemo, useCallback } from "react"
import { InteractionManager, View, StyleSheet, Pressable, Text, Alert } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
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
  const directory = useConnection((s) => s.directory)
  const switchDirectory = useConnection((s) => s.switchDirectory)
  const requestOpen = useSidebar((s) => s.requestOpen)
  const messages = useSessionMessages(id)
  const [markdownReady, setMarkdownReady] = useState(false)
  const session = useMemo(() => sessions.find((item) => item.id === id), [sessions, id])
  const title = (session?.title || "").trim() || "Untitled session"
  // Track which sessions have been viewed — disable fade for revisited chats
  const seen = useRef(new Set<string>())
  const wasSeen = id ? seen.current.has(id) : false

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
      setMarkdownReady(false)
      void load(id, { limit: 60, compact: true })
      // Mark as seen after a short delay to let initial content animate
      const timer = setTimeout(() => seen.current.add(id), 1500)
      let poll: ReturnType<typeof setInterval> | null = null
      const interactionTask = InteractionManager.runAfterInteractions(() => {
        setMarkdownReady(true)
        markChatInteractionReady(id)
        void refreshRequests()
        poll = setInterval(() => {
          void refreshRequests()
        }, 10_000)
      })
      return () => {
        clearTimeout(timer)
        interactionTask.cancel()
        if (poll) clearInterval(poll)
      }
    }
  }, [id, load, select, refreshRequests])

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
                paddingTop: insets.top + 2,
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
                <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
                  {title}
                </Text>
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

          <MessagesList sessionId={id} messages={messages} enableMarkdown={markdownReady} topPadding={12} />
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
    gap: 12,
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
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  menuIcon: {
    width: 16,
    height: 12,
    justifyContent: "space-between",
  },
  menuLine: {
    height: 1.7,
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
  },
  composeBox: {
    position: "absolute",
    left: 1.2,
    bottom: 1.2,
    width: 10.8,
    height: 10.8,
    borderWidth: 1.4,
    borderRadius: 2.4,
  },
  composePencilShaft: {
    position: "absolute",
    right: 0.6,
    top: 1.2,
    width: 9,
    height: 1.7,
    borderRadius: 1,
    transform: [{ rotate: "-38deg" }],
  },
  composePencilTip: {
    position: "absolute",
    right: 6.8,
    top: 4.9,
    width: 0,
    height: 0,
    borderTopWidth: 1.8,
    borderBottomWidth: 1.8,
    borderRightWidth: 0,
    borderLeftWidth: 2.8,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    transform: [{ rotate: "-38deg" }],
  },
  ellipsisIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2.5,
  },
  ellipsisDot: {
    width: 3.3,
    height: 3.3,
    borderRadius: 2,
  },
})
