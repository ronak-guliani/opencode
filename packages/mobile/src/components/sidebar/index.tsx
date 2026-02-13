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
  Platform,
  type ViewProps,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { BlurView } from "expo-blur"
import { useDrawerProgress } from "react-native-drawer-layout"
import Animated, { interpolate, useAnimatedStyle } from "react-native-reanimated"
import * as ZeegoContextMenu from "zeego/context-menu"
import * as Haptics from "expo-haptics"
import * as Clipboard from "expo-clipboard"
import type { Project, Session } from "@opencode-ai/sdk/client"
import { useSessions } from "../../store/sessions"
import { useConnection } from "../../store/connection"
import { useTheme } from "../../theme"
import { relative } from "../../util/format"
import { SessionListSkeleton } from "../skeleton"
import { client } from "../../api/client"

// React 19 JSX compat casts
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
const AnimatedView = Animated.View as React.ComponentType<ViewProps & { style?: unknown; children?: React.ReactNode }>

type Props = {
  onSelect: (session: Session) => void | Promise<void>
  onNew: () => void
  onSettings: () => void
}

type SectionItem =
  | { type: "project"; project: Project; count: number; collapsed: boolean; active: boolean }
  | { type: "session"; session: Session }

function shortenPath(p: string) {
  const parts = p.split("/")
  if (parts.length <= 3) return p
  return "~/" + parts.slice(-2).join("/")
}

export const Sidebar = memo(function Sidebar({ onSelect, onNew, onSettings }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const progress = useDrawerProgress()
  const projects = useSessions((s) => s.projects)
  const sessions = useSessions((s) => s.sessions)
  const loading = useSessions((s) => s.loading)
  const fetch = useSessions((s) => s.fetch)
  const fetchStatuses = useSessions((s) => s.fetchStatuses)
  const archive = useSessions((s) => s.archive)
  const deleteSession = useSessions((s) => s.delete)
  const directory = useConnection((s) => s.directory)
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const filteredSessions = useMemo(() => {
    if (!query.trim()) return sessions
    const q = query.toLowerCase()
    return sessions.filter((s) => (s.title || "").toLowerCase().includes(q))
  }, [sessions, query])

  const projectsWithFallback = useMemo(() => {
    const map = new Map(projects.map((project) => [project.worktree, project]))
    for (const session of filteredSessions) {
      if (!map.has(session.directory)) {
        map.set(session.directory, {
          id: session.projectID,
          worktree: session.directory,
          vcs: "git",
          time: { created: session.time.created },
        })
      }
    }
    return [...map.values()]
  }, [projects, filteredSessions])

  const items = useMemo(() => {
    const grouped = filteredSessions.reduce<Record<string, Session[]>>((acc, session) => {
      const bucket = acc[session.directory] ?? []
      bucket.push(session)
      acc[session.directory] = bucket
      return acc
    }, {})
    for (const worktree of Object.keys(grouped)) {
      grouped[worktree] = grouped[worktree].sort((a, b) => b.time.updated - a.time.updated)
    }

    const orderedProjects = [...projectsWithFallback].sort((a, b) => {
      if (a.worktree === directory) return -1
      if (b.worktree === directory) return 1
      return a.worktree.localeCompare(b.worktree)
    })

    return orderedProjects.flatMap((project) => {
      const sessions = grouped[project.worktree] ?? []
      const isCollapsed = collapsed[project.worktree] ?? false
      const header: SectionItem = {
        type: "project",
        project,
        count: sessions.length,
        collapsed: isCollapsed,
        active: project.worktree === directory,
      }
      if (isCollapsed) return [header]
      return [header, ...sessions.map((session) => ({ type: "session", session } as const))]
    })
  }, [filteredSessions, projectsWithFallback, directory, collapsed])

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
            deleteSession(id)
          },
        },
      ])
    },
    [deleteSession],
  )

  const handleRefresh = useCallback(async () => {
    await Promise.all([fetch(), fetchStatuses()])
  }, [fetch, fetchStatuses])

  const handleShare = useCallback(async (id: string) => {
    try {
      const result = await client().session.share({ path: { id } })
      const shareURL = result.data?.share?.url
      if (!shareURL) {
        Alert.alert("Share unavailable", "Could not generate a share link for this session.")
        return
      }
      await Clipboard.setStringAsync(shareURL)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert("Share link copied", shareURL)
    } catch {
      Alert.alert("Share failed", "Could not generate a share link.")
    }
  }, [])

  const toggleProject = useCallback((worktree: string) => {
    setCollapsed((state) => ({ ...state, [worktree]: !(state[worktree] ?? false) }))
  }, [])

  const renderItem = useCallback(
    ({ item }: { item: SectionItem }) => {
      if (item.type === "project") {
        return <ProjectRow item={item} onToggle={toggleProject} />
      }
      return (
        <SessionRow
          session={item.session}
          onSelect={onSelect}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onShare={handleShare}
        />
      )
    },
    [handleArchive, handleDelete, handleShare, onSelect, toggleProject],
  )

  const keyExtractor = useCallback((item: SectionItem) => {
    if (item.type === "project") return `project-${item.project.id}-${item.project.worktree}`
    return item.session.id
  }, [])

  const projectName = "Projects"
  const projectPath = directory ? shortenPath(directory) : "No active project"
  const tint = theme.colors.background === "#09090b" ? "dark" : "light"
  const isIOS = Platform.OS === "ios"
  const overlayTint = tint === "dark" ? "#09090b" : "#ffffff"

  const overlayStyle = useAnimatedStyle(
    () => ({
      opacity: isIOS ? interpolate(progress.value, [0, 1], [0.16, 0.26]) : 1,
    }),
    [isIOS],
  )

  const gestureBlurStyle = useAnimatedStyle(
    () => {
      const slide = progress.value * (1 - progress.value) * 4
      return {
        opacity: isIOS ? slide * 0.42 : 0,
      }
    },
    [isIOS],
  )

  const content = (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={[styles.projectName, { color: theme.colors.text }]}>{projectName}</Text>
          <Text
            style={[styles.projectPath, { color: theme.colors.textTertiary }]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {projectPath}
          </Text>
        </View>
      </View>

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
            <RefreshControl refreshing={loading} onRefresh={handleRefresh} tintColor={theme.colors.textTertiary} />
          }
          showsVerticalScrollIndicator={false}
          initialNumToRender={16}
          windowSize={7}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={16}
          removeClippedSubviews={false}
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

  return (
    <View style={styles.surface}>
      {Platform.OS === "ios" ? (
        <View style={styles.blur}>
          <BlurView intensity={88} tint={tint} style={StyleSheet.absoluteFill} />
          <AnimatedView pointerEvents="none" style={[styles.overlay, { backgroundColor: overlayTint }, overlayStyle]} />
          {content}
          <AnimatedView pointerEvents="none" style={[styles.slideBlur, gestureBlurStyle]}>
            <BlurView intensity={56} tint={tint} style={StyleSheet.absoluteFill} />
          </AnimatedView>
        </View>
      ) : (
        <View style={[styles.fallbackSurface, { backgroundColor: theme.colors.background }]}>{content}</View>
      )}
    </View>
  )
})

const ProjectRow = memo(function ProjectRow({
  item,
  onToggle,
}: {
  item: Extract<SectionItem, { type: "project" }>
  onToggle: (worktree: string) => void
}) {
  const theme = useTheme()
  const name = item.project.worktree.split("/").pop() || item.project.worktree
  const icon = item.collapsed ? ">" : "v"

  return (
    <Pressable
      style={[
        styles.projectRow,
        {
          borderColor: theme.colors.border,
          backgroundColor: item.active ? theme.colors.surfaceRaised : "transparent",
          borderRadius: theme.radii.md,
        },
      ]}
      onPress={() => onToggle(item.project.worktree)}
    >
      <Text style={[styles.projectChevron, { color: theme.colors.textSecondary }]}>{icon}</Text>
      <View style={styles.projectMain}>
        <Text style={[styles.projectTitle, { color: theme.colors.text }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.projectMeta, { color: theme.colors.textTertiary }]} numberOfLines={1}>
          {`${shortenPath(item.project.worktree)} | ${item.count}`}
        </Text>
      </View>
    </Pressable>
  )
})

const SessionRow = memo(function SessionRow({
  session,
  onSelect,
  onArchive,
  onDelete,
  onShare,
}: {
  session: Session
  onSelect: (session: Session) => void | Promise<void>
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onShare: (id: string) => void
}) {
  const theme = useTheme()
  const status = useSessions((s) => s.statuses[session.id])
  const selected = useSessions((s) => s.current === session.id)

  const handleMenuOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }, [])

  const rowBody = (
    <Pressable
      style={[
        styles.sessionRow,
        {
          backgroundColor: selected ? theme.colors.surfaceRaised : "transparent",
          borderRadius: theme.radii.md,
        },
      ]}
      onPress={() => void onSelect(session)}
    >
      <View style={styles.statusSlot}>
        <StatusDot status={status?.type} />
      </View>
      <View style={styles.sessionMain}>
        <Text style={[styles.sessionTitle, { color: theme.colors.text }]} numberOfLines={2}>
          {session.title || "Untitled session"}
        </Text>
        <Text style={[styles.sessionMeta, { color: theme.colors.textTertiary }]}>
          {relative(session.time.updated)}
        </Text>
      </View>
    </Pressable>
  )

  return (
    <MenuRoot onOpenChange={(open) => open && handleMenuOpen()}>
      <MenuTrigger>{rowBody}</MenuTrigger>

      <MenuContent>
        <MenuItem key="share" onSelect={() => onShare(session.id)}>
          <MenuItemTitle>Share</MenuItemTitle>
          <MenuItemIcon ios={{ name: "square.and.arrow.up" }} />
        </MenuItem>
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
  )
})

function StatusDot({ status }: { status?: string }) {
  const theme = useTheme()
  const color =
    status === "busy" ? theme.colors.statusBusy : status === "retry" ? theme.colors.statusError : theme.colors.statusIdle
  return <View style={[styles.dot, { backgroundColor: color }]} />
}

const styles = StyleSheet.create({
  surface: {
    flex: 1,
  },
  blur: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  slideBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  fallbackSurface: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerContent: {},
  projectName: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.35,
  },
  projectPath: {
    fontSize: 11,
    marginTop: 3,
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
    paddingBottom: 8,
  },
  projectRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  projectChevron: {
    width: 14,
    fontSize: 11,
    fontWeight: "700",
  },
  projectMain: {
    flex: 1,
    gap: 1,
  },
  projectTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  projectMeta: {
    fontSize: 11,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingLeft: 18,
    paddingRight: 10,
    paddingVertical: 11,
    gap: 8,
  },
  statusSlot: {
    width: 12,
    alignItems: "center",
    paddingTop: 6,
  },
  sessionMain: {
    flex: 1,
    gap: 2,
    paddingRight: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sessionTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
  },
  sessionMeta: {
    fontSize: 12,
    lineHeight: 16,
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
