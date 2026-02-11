import { useCallback, useMemo, memo, useState } from "react"
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
  Alert,
  type ViewProps,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from "react-native-reanimated"
import { LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass"
import * as ZeegoContextMenu from "zeego/context-menu"
import * as Haptics from "expo-haptics"
import type { Session } from "@opencode-ai/sdk/client"
import { useSessions } from "../../store/sessions"
import { useConnection } from "../../store/connection"
import { useTheme } from "../../theme"
import { group as dateGroup, relative } from "../../util/format"
import { AnimatedStatusDot } from "../status-dot"
import { SessionListSkeleton } from "../skeleton"

// React 19 JSX compat casts
const AnimatedView = Animated.View as React.ComponentType<ViewProps & { style?: unknown }>
const MenuRoot = ZeegoContextMenu.Root as React.ComponentType<{
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}>
const MenuTrigger = ZeegoContextMenu.Trigger as React.ComponentType<{ children?: React.ReactNode }>
const MenuContent = ZeegoContextMenu.Content as React.ComponentType<{ children?: React.ReactNode }>
const MenuItem = ZeegoContextMenu.Item as React.ComponentType<{
  key: string
  onSelect?: () => void
  destructive?: boolean
  children?: React.ReactNode
}>
const MenuItemTitle = ZeegoContextMenu.ItemTitle as React.ComponentType<{ children?: React.ReactNode }>
const MenuItemIcon = ZeegoContextMenu.ItemIcon as React.ComponentType<{
  ios?: { name: string }
  children?: React.ReactNode
}>

type Props = {
  onSelect: (id: string) => void
  onNew: () => void
  onSettings: () => void
}

type SectionItem = { type: "header"; title: string } | { type: "session"; session: Session }

const SWIPE_THRESHOLD = -80

function shortenPath(p: string) {
  const parts = p.split("/")
  if (parts.length <= 3) return p
  return "~/" + parts.slice(-2).join("/")
}

export function Sidebar({ onSelect, onNew, onSettings }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const sessions = useSessions((s) => s.sessions)
  const loading = useSessions((s) => s.loading)
  const fetch = useSessions((s) => s.fetch)
  const archive = useSessions((s) => s.archive)
  const directory = useConnection((s) => s.directory)
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    if (!query.trim()) return sessions
    const q = query.toLowerCase()
    return sessions.filter((s) => (s.title || "").toLowerCase().includes(q))
  }, [sessions, query])

  const items = useMemo(() => {
    const result: SectionItem[] = []
    let lastGroup = ""
    for (const session of filtered) {
      const g = dateGroup(session.time.updated)
      if (g !== lastGroup) {
        result.push({ type: "header", title: g })
        lastGroup = g
      }
      result.push({ type: "session", session })
    }
    return result
  }, [filtered])

  const handleArchive = useCallback(
    (id: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      archive(id)
    },
    [archive],
  )

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert("Delete Session", "This action cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
            archive(id)
          },
        },
      ])
    },
    [archive],
  )

  const renderItem = useCallback(
    ({ item }: { item: SectionItem }) => {
      if (item.type === "header") {
        return <Text style={[styles.sectionHeader, { color: theme.colors.textTertiary }]}>{item.title}</Text>
      }
      return <SessionRow session={item.session} onSelect={onSelect} onArchive={handleArchive} onDelete={handleDelete} />
    },
    [theme, handleArchive, handleDelete, onSelect],
  )

  const keyExtractor = useCallback((item: SectionItem, index: number) => {
    if (item.type === "header") return `header-${item.title}-${index}`
    return item.session.id
  }, [])

  const projectName = directory?.split("/").pop() ?? "opencode"
  const projectPath = directory ? shortenPath(directory) : ""

  const Glass = LiquidGlassView as React.ComponentType<{
    style?: unknown
    children?: React.ReactNode
  }>

  const header = (
    <View style={styles.headerContent}>
      <Text style={[styles.projectName, { color: theme.colors.text }]}>{projectName}</Text>
      <Text style={[styles.projectPath, { color: theme.colors.textTertiary }]} numberOfLines={1} ellipsizeMode="middle">
        {projectPath}
      </Text>
    </View>
  )

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: theme.colors.background }]}>
      {isLiquidGlassSupported ? (
        <Glass style={[styles.header, styles.glassHeader]}>{header}</Glass>
      ) : (
        <View style={styles.header}>{header}</View>
      )}

      <Pressable
        style={[styles.newButton, { backgroundColor: theme.colors.accent, borderRadius: theme.radii.md }]}
        onPress={onNew}
      >
        <Text style={[styles.newButtonText, { color: theme.colors.accentText }]}>New Session</Text>
      </Pressable>

      <View
        style={[styles.searchContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
      >
        <TextInput
          style={[styles.searchInput, { color: theme.colors.text }]}
          value={query}
          onChangeText={setQuery}
          placeholder="Search sessions..."
          placeholderTextColor={theme.colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {loading && sessions.length === 0 ? (
        <SessionListSkeleton />
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={fetch} tintColor={theme.colors.textTertiary} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <Pressable
        style={[styles.settingsButton, { borderTopColor: theme.colors.border, paddingBottom: insets.bottom + 8 }]}
        onPress={onSettings}
      >
        <Text style={[styles.settingsText, { color: theme.colors.textSecondary }]}>Settings</Text>
      </Pressable>
    </View>
  )
}

const SessionRow = memo(function SessionRow({
  session,
  onSelect,
  onArchive,
  onDelete,
}: {
  session: Session
  onSelect: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
}) {
  const theme = useTheme()
  const status = useSessions((s) => s.statuses[session.id])
  const selected = useSessions((s) => s.current === session.id)
  const translateX = useSharedValue(0)

  const doArchive = useCallback(() => onArchive(session.id), [session.id, onArchive])

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-5, 5])
    .onUpdate((e) => {
      if (e.translationX < 0) {
        translateX.value = Math.max(e.translationX, -120)
      }
    })
    .onEnd((e) => {
      if (e.translationX < SWIPE_THRESHOLD) {
        runOnJS(doArchive)()
        translateX.value = withTiming(-300, { duration: 200 })
      } else {
        translateX.value = withTiming(0, { duration: 200 })
      }
    })

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  const archiveStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < -20 ? 1 : 0,
  }))

  const handleMenuOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }, [])

  return (
    <View style={styles.swipeContainer}>
      <AnimatedView style={[styles.archiveAction, { backgroundColor: theme.colors.warning }, archiveStyle]}>
        <Text style={styles.archiveText}>Archive</Text>
      </AnimatedView>
      <GestureDetector gesture={pan}>
        <AnimatedView style={rowStyle}>
          <MenuRoot onOpenChange={(open) => open && handleMenuOpen()}>
            <MenuTrigger>
              <Pressable
                style={[
                  styles.sessionRow,
                  {
                    backgroundColor: selected ? theme.colors.surfaceRaised : "transparent",
                    borderRadius: theme.radii.md,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync()
                  onSelect(session.id)
                }}
              >
                <AnimatedStatusDot status={status} />
                <Text style={[styles.sessionTitle, { color: theme.colors.text }]} numberOfLines={1}>
                  {session.title || "Untitled"}
                </Text>
                <Text style={[styles.sessionTime, { color: theme.colors.textTertiary }]}>
                  {relative(session.time.updated)}
                </Text>
              </Pressable>
            </MenuTrigger>

            <MenuContent>
              <MenuItem key="archive" onSelect={() => onArchive(session.id)}>
                <MenuItemTitle>Archive</MenuItemTitle>
                <MenuItemIcon ios={{ name: "archivebox" }} />
              </MenuItem>
              <MenuItem key="delete" onSelect={() => onDelete(session.id)} destructive>
                <MenuItemTitle>Delete</MenuItemTitle>
                <MenuItemIcon ios={{ name: "trash" }} />
              </MenuItem>
            </MenuContent>
          </MenuRoot>
        </AnimatedView>
      </GestureDetector>
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  glassHeader: {
    marginHorizontal: 8,
    borderRadius: 12,
  },
  headerContent: {},
  projectName: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  projectPath: {
    fontSize: 10,
    marginTop: 2,
  },
  newButton: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  newButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  searchContainer: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 8,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingTop: 16,
    paddingBottom: 4,
  },
  swipeContainer: {
    overflow: "hidden",
  },
  archiveAction: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 20,
    borderRadius: 10,
  },
  archiveText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  sessionTitle: {
    flex: 1,
    fontSize: 14,
  },
  sessionTime: {
    fontSize: 11,
  },
  settingsButton: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  settingsText: {
    fontSize: 14,
  },
})
