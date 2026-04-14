import { useCallback, useMemo, memo, useState } from "react"
import { View, Text, TextInput, Pressable, StyleSheet, RefreshControl, Alert } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass"
import * as Haptics from "expo-haptics"
import * as Clipboard from "expo-clipboard"
import Feather from "@expo/vector-icons/Feather"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list"
import { useGlobalSearchParams } from "expo-router"
import type { Project, Session } from "@opencode-ai/sdk/client"
import { useSessions } from "../../store/sessions"
import { useConnection } from "../../store/connection"
import { useTheme } from "../../theme"
import { relative } from "../../util/format"
import { SessionListSkeleton } from "../skeleton"
import { client } from "../../api/client"
import { ServerSwitcher } from "./server-switcher"

const Glass = LiquidGlassView as React.ComponentType<{
  interactive?: boolean
  style?: unknown
  children?: React.ReactNode
}>
const FeatherIcon = Feather as unknown as React.ComponentType<{
  name: string
  size: number
  color: string
  style?: unknown
}>
const SIDEBAR_DRAW_DISTANCE = 700
const SESSION_RENDER_CHUNK = 20
const MaterialIcon = MaterialCommunityIcons as unknown as React.ComponentType<{
  name: string
  size: number
  color: string
  style?: unknown
}>

type Props = {
  onSelect: (session: Session) => void | Promise<void>
  onNew: (worktree?: string) => void | Promise<void>
  onSettings: () => void
  sidebarVisible: boolean
  onServerSwitched?: () => void
}

type ProjectHeaderItem = {
  type: "header"
  project: Project
  sessions: Session[]
  count: number
  collapsed: boolean
  active: boolean
}

type SessionRowItem = {
  type: "session"
  session: Session
  isLast: boolean
  worktree: string
}

type LoadMoreItem = {
  type: "load-more"
  worktree: string
  remaining: number
  chunk: number
}

type FlatItem = ProjectHeaderItem | SessionRowItem | LoadMoreItem

function resolveRouteSessionID(value: string | string[] | undefined) {
  if (typeof value === "string") return value || null
  if (Array.isArray(value)) {
    for (const candidate of value) {
      if (candidate) return candidate
    }
  }
  return null
}

export const Sidebar = memo(function Sidebar({ onSelect, onNew, onSettings, sidebarVisible, onServerSwitched }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const projects = useSessions((s) => s.projects)
  const sessions = useSessions((s) => s.sessions)
  const loading = useSessions((s) => s.loading)
  const fetch = useSessions((s) => s.fetch)
  const fetchStatuses = useSessions((s) => s.fetchStatuses)
  const archive = useSessions((s) => s.archive)
  const deleteSession = useSessions((s) => s.delete)
  const currentSessionID = useSessions((s) => s.current)
  const directory = useConnection((s) => s.directory)
  const routeParams = useGlobalSearchParams<{ id?: string | string[] }>()
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({})
  const routeSessionID = useMemo(() => resolveRouteSessionID(routeParams.id), [routeParams.id])
  const activeSessionID = routeSessionID ?? currentSessionID

  const filteredSessions = useMemo(() => {
    const deduped = dedupeSessionsByID(sessions)
    if (!query.trim()) return deduped
    const q = query.toLowerCase()
    return deduped.filter((s) => {
      const title = (s.title || "").toLowerCase()
      return title.includes(q) || s.directory.toLowerCase().includes(q)
    })
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
      const aTime = grouped[a.worktree]?.[0]?.time.updated ?? 0
      const bTime = grouped[b.worktree]?.[0]?.time.updated ?? 0
      if (aTime === bTime) return a.worktree.localeCompare(b.worktree)
      return bTime - aTime
    })

    const flat: FlatItem[] = []
    for (const project of orderedProjects) {
      const sessions = grouped[project.worktree] ?? []
      const isCollapsed = collapsed[project.worktree] ?? false
      const hasActiveSession = !!activeSessionID && sessions.some((s) => s.id === activeSessionID)
      flat.push({
        type: "header",
        project,
        sessions,
        count: sessions.length,
        collapsed: isCollapsed,
        active: hasActiveSession || project.worktree === directory,
      })
      if (!isCollapsed && sessions.length > 0) {
        const cap = Math.max(SESSION_RENDER_CHUNK, visibleCounts[project.worktree] ?? SESSION_RENDER_CHUNK)
        const visible = sessions.slice(0, cap)
        const remaining = Math.max(0, sessions.length - visible.length)
        for (let i = 0; i < visible.length; i++) {
          flat.push({
            type: "session",
            session: visible[i],
            isLast: i === visible.length - 1 && remaining === 0,
            worktree: project.worktree,
          })
        }
        if (remaining > 0) {
          flat.push({
            type: "load-more",
            worktree: project.worktree,
            remaining,
            chunk: Math.min(remaining, SESSION_RENDER_CHUNK),
          })
        }
      }
    }
    return flat
  }, [activeSessionID, collapsed, directory, filteredSessions, projectsWithFallback, visibleCounts])

  const handleArchive = useCallback(
    (id: string) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
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
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
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
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert("Share link copied", shareURL)
    } catch {
      Alert.alert("Share failed", "Could not generate a share link.")
    }
  }, [])

  const toggleProject = useCallback((worktree: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setCollapsed((state) => {
      const next = !(state[worktree] ?? false)
      if (next) {
        setVisibleCounts((counts) => {
          if (!(worktree in counts)) return counts
          const { [worktree]: _, ...rest } = counts
          return rest
        })
      }
      return { ...state, [worktree]: next }
    })
  }, [])

  const allCollapsed = useMemo(() => {
    if (projectsWithFallback.length === 0) return false
    return projectsWithFallback.every((project) => collapsed[project.worktree] ?? false)
  }, [projectsWithFallback, collapsed])

  const toggleAll = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setCollapsed((state) => {
      const shouldCollapse = !projectsWithFallback.every((project) => state[project.worktree] ?? false)
      const next = { ...state }
      for (const project of projectsWithFallback) {
        next[project.worktree] = shouldCollapse
      }
      return next
    })
  }, [projectsWithFallback])

  const handleCreateSession = useCallback(
    (worktree?: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      void onNew(worktree)
    },
    [onNew],
  )

  const loadMoreSessions = useCallback((worktree: string) => {
    setVisibleCounts((counts) => ({
      ...counts,
      [worktree]: (counts[worktree] ?? SESSION_RENDER_CHUNK) + SESSION_RENDER_CHUNK,
    }))
  }, [])

  const projectRowColors = useMemo(
    () => ({
      border: theme.colors.border,
      surface: theme.colors.surface,
      text: theme.colors.text,
      textSecondary: theme.colors.textSecondary,
      textTertiary: theme.colors.textTertiary,
      surfaceRaised: theme.colors.surfaceRaised,
    }),
    [
      theme.colors.border,
      theme.colors.surface,
      theme.colors.text,
      theme.colors.textSecondary,
      theme.colors.textTertiary,
      theme.colors.surfaceRaised,
    ],
  )

  const projectRowRadii = useMemo(() => ({ md: theme.radii.md }), [theme.radii.md])

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<FlatItem>) => {
      if (item.type === "header") {
        return (
          <ProjectRow
            item={item}
            onToggle={toggleProject}
            onNew={handleCreateSession}
            colors={projectRowColors}
            radii={projectRowRadii}
          />
        )
      }
      if (item.type === "session") {
        return (
          <SessionRow
            session={item.session}
            onSelect={(session) => void onSelect(session)}
            onArchive={handleArchive}
            onDelete={handleDelete}
            onShare={handleShare}
            activeSessionID={activeSessionID}
            textColor={theme.colors.text}
            tertiaryColor={theme.colors.textTertiary}
            surfaceColor={theme.colors.surface}
          />
        )
      }
      return (
        <LoadMoreRow
          worktree={item.worktree}
          remaining={item.remaining}
          chunk={item.chunk}
          onLoadMore={loadMoreSessions}
          borderColor={theme.colors.border}
          surfaceColor={theme.colors.surface}
          textSecondaryColor={theme.colors.textSecondary}
        />
      )
    },
    [
      activeSessionID,
      handleArchive,
      handleCreateSession,
      handleDelete,
      handleShare,
      loadMoreSessions,
      onSelect,
      projectRowColors,
      projectRowRadii,
      theme.colors.border,
      theme.colors.surface,
      theme.colors.text,
      theme.colors.textSecondary,
      theme.colors.textTertiary,
      toggleProject,
    ],
  )

  const keyExtractor = useCallback((item: FlatItem) => {
    if (item.type === "header") return `project-${item.project.id}-${item.project.worktree}`
    if (item.type === "session") return `session-${item.session.id}`
    return `load-more-${item.worktree}`
  }, [])

  const getItemType = useCallback((item: FlatItem) => item.type, [])

  const content = (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Threads</Text>
        <View style={styles.headerActions}>
          <HeaderIconButton
            icon="compose"
            label="New Session"
            onPress={() => handleCreateSession()}
            textSecondaryColor={theme.colors.textSecondary}
            surfaceColor={theme.colors.surface}
            borderColor={theme.colors.border}
          />
          <HeaderIconButton
            icon={allCollapsed ? "expand-all" : "collapse-all"}
            label={allCollapsed ? "Expand all projects" : "Collapse all projects"}
            onPress={toggleAll}
            textSecondaryColor={theme.colors.textSecondary}
            surfaceColor={theme.colors.surface}
            borderColor={theme.colors.border}
          />
          <HeaderIconButton
            icon="settings"
            label="Settings"
            onPress={onSettings}
            textSecondaryColor={theme.colors.textSecondary}
            surfaceColor={theme.colors.surface}
            borderColor={theme.colors.border}
          />
        </View>
      </View>

      {isLiquidGlassSupported ? (
        <Glass interactive style={styles.searchGlass}>
          <FeatherIcon style={styles.searchIcon} name="search" size={14} color={theme.colors.textTertiary} />
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
        </Glass>
      ) : (
        <View
          style={[
            styles.searchContainer,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <FeatherIcon style={styles.searchIcon} name="search" size={14} color={theme.colors.textTertiary} />
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
      )}

      <ServerSwitcher sidebarVisible={sidebarVisible} onServerSwitched={onServerSwitched} />

      {loading && sessions.length === 0 ? (
        <SessionListSkeleton />
      ) : (
        <FlashList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 16 }]}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={handleRefresh} tintColor={theme.colors.textTertiary} />
          }
          showsVerticalScrollIndicator={false}
          drawDistance={SIDEBAR_DRAW_DISTANCE}
          removeClippedSubviews
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>No sessions found.</Text>
          }
        />
      )}
    </View>
  )

  return <View style={[styles.surface, { backgroundColor: theme.colors.background }]}>{content}</View>
})

function dedupeSessionsByID(list: Session[]): Session[] {
  const deduped: Session[] = []
  const seen = new Set<string>()
  for (const session of list) {
    if (seen.has(session.id)) continue
    seen.add(session.id)
    deduped.push(session)
  }
  return deduped
}

const ProjectRow = memo(function ProjectRow({
  item,
  onToggle,
  onNew,
  colors,
  radii,
}: {
  item: ProjectHeaderItem
  onToggle: (worktree: string) => void
  onNew: (worktree: string) => void
  colors: {
    border: string
    surface: string
    text: string
    textSecondary: string
    textTertiary: string
    surfaceRaised: string
  }
  radii: { md: number }
}) {
  const parts = item.project.worktree.split(/[\\/]/).filter(Boolean)
  const name = parts[parts.length - 1] || item.project.worktree

  return (
    <Pressable
      style={[
        styles.projectRow,
        {
          borderColor: colors.border,
          backgroundColor: item.active ? colors.surface : "transparent",
          borderRadius: radii.md,
        },
      ]}
      onPress={() => onToggle(item.project.worktree)}
    >
      <View style={styles.projectMain}>
        <View style={styles.projectTitleRow}>
          <FeatherIcon name="folder" size={14} color={colors.textSecondary} />
          <Text style={[styles.projectTitle, { color: colors.text }]} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <Text style={[styles.projectPath, { color: colors.textTertiary }]} numberOfLines={1} ellipsizeMode="middle">
          {item.project.worktree}
        </Text>
      </View>
      <View style={styles.projectActions}>
        <Pressable
          style={[styles.projectActionButton, { backgroundColor: colors.surfaceRaised }]}
          onPress={(event) => {
            event.stopPropagation()
            onNew(item.project.worktree)
          }}
          hitSlop={8}
        >
          <FeatherIcon name="plus" size={14} color={colors.textSecondary} />
        </Pressable>
        <Text style={[styles.projectCount, { color: colors.textTertiary }]}>{item.count}</Text>
        <FeatherIcon
          style={styles.chevronGlyph}
          name={item.collapsed ? "chevron-right" : "chevron-down"}
          size={14}
          color={colors.textSecondary}
        />
      </View>
    </Pressable>
  )
})

const LoadMoreRow = memo(function LoadMoreRow({
  worktree,
  remaining,
  chunk,
  onLoadMore,
  borderColor,
  surfaceColor,
  textSecondaryColor,
}: {
  worktree: string
  remaining: number
  chunk: number
  onLoadMore: (worktree: string) => void
  borderColor: string
  surfaceColor: string
  textSecondaryColor: string
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.loadMoreSessionsButton,
        styles.sessionIndent,
        { borderColor, backgroundColor: surfaceColor },
        pressed && styles.headerIconButtonPressed,
      ]}
      onPress={() => onLoadMore(worktree)}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Load more sessions"
    >
      <Text style={[styles.loadMoreSessionsText, { color: textSecondaryColor }]}>
        Show {chunk} more ({remaining} remaining)
      </Text>
    </Pressable>
  )
})

const SessionRow = memo(function SessionRow({
  session,
  onSelect,
  onArchive,
  onDelete,
  onShare,
  activeSessionID,
  textColor,
  tertiaryColor,
  surfaceColor,
}: {
  session: Session
  onSelect: (session: Session) => void | Promise<void>
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onShare: (id: string) => void
  activeSessionID: string | null
  textColor: string
  tertiaryColor: string
  surfaceColor: string
}) {
  const selected = activeSessionID === session.id

  const handleSelect = useCallback(() => {
    void onSelect(session)
  }, [onSelect, session])

  const handleLongPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Alert.alert(session.title || "Session actions", undefined, [
      { text: "Share", onPress: () => void onShare(session.id) },
      { text: "Archive", onPress: () => void onArchive(session.id) },
      { text: "Delete", style: "destructive", onPress: () => void onDelete(session.id) },
      { text: "Cancel", style: "cancel" },
    ])
  }, [onArchive, onDelete, onShare, session.id, session.title])

  return (
    <Pressable
      style={({ pressed }) => [
        styles.sessionRow,
        styles.sessionIndent,
        selected && { backgroundColor: surfaceColor },
        { opacity: pressed ? 0.72 : 1 },
      ]}
      onPress={handleSelect}
      onLongPress={handleLongPress}
      delayLongPress={260}
      hitSlop={6}
    >
      <View style={styles.sessionMain}>
        <Text style={[styles.sessionTitle, { color: textColor }]} numberOfLines={1}>
          {session.title || "Untitled session"}
        </Text>
        <Text style={[styles.sessionMeta, { color: tertiaryColor }]}>{relative(session.time.updated)}</Text>
      </View>
    </Pressable>
  )
})

const HeaderIconButton = memo(function HeaderIconButton({
  icon,
  label,
  onPress,
  textSecondaryColor,
  surfaceColor,
  borderColor,
}: {
  icon: "compose" | "collapse-all" | "expand-all" | "settings"
  label: string
  onPress: () => void
  textSecondaryColor: string
  surfaceColor: string
  borderColor: string
}) {
  const color = textSecondaryColor
  const iconName =
    icon === "compose"
      ? "edit-3"
      : icon === "collapse-all"
        ? "chevrons-up"
        : icon === "expand-all"
          ? "chevrons-down"
          : "settings"
  const iconNode =
    icon === "compose" ? (
      <MaterialIcon style={styles.composeSymbol} name="square-edit-outline" size={16} color={color} />
    ) : (
      <FeatherIcon name={iconName} size={14} color={color} />
    )

  if (isLiquidGlassSupported) {
    return (
      <Glass interactive style={styles.headerIconGlass}>
        <Pressable
          style={({ pressed }) => [styles.headerIconButton, pressed && styles.headerIconButtonPressed]}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          hitSlop={8}
        >
          {iconNode}
        </Pressable>
      </Glass>
    )
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.headerIconButton,
        styles.headerIconButtonFallback,
        { backgroundColor: surfaceColor, borderColor },
        pressed && styles.headerIconButtonPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
    >
      {iconNode}
    </Pressable>
  )
})

const styles = StyleSheet.create({
  surface: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconButtonFallback: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerIconButtonPressed: {
    opacity: 0.6,
  },
  headerIconGlass: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  composeSymbol: {
    marginTop: 0.5,
  },
  searchContainer: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
  },
  searchGlass: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 18,
    minHeight: 42,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingLeft: 8,
    paddingRight: 12,
    paddingVertical: 9,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
  },
  projectSection: {
    marginTop: 10,
  },
  projectRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 0,
    marginBottom: 0,
    gap: 8,
  },
  projectMain: {
    flex: 1,
    gap: 3,
  },
  projectTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  projectTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
  },
  projectPath: {
    fontSize: 11,
  },
  projectActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 2,
  },
  projectActionButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  projectCount: {
    minWidth: 18,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "500",
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 54,
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 6,
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  sessionIndent: {
    marginLeft: 34,
  },
  sessionMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  sessionTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "500",
  },
  sessionMeta: {
    fontSize: 13,
    lineHeight: 17,
    minWidth: 66,
    textAlign: "right",
    flexShrink: 0,
  },
  loadMoreSessionsButton: {
    marginTop: 2,
    marginRight: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  loadMoreSessionsText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    textAlign: "center",
  },
  emptyText: {
    paddingHorizontal: 18,
    paddingTop: 20,
    fontSize: 13,
  },
  chevronGlyph: {
    width: 14,
    textAlign: "center",
  },
  searchIcon: {
    marginLeft: 10,
    marginRight: 2,
  },
})
