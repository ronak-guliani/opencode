import { useCallback, useEffect, useMemo, memo, useRef, useState } from "react"
import { View, Text, TextInput, Pressable, StyleSheet, RefreshControl, Alert } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass"
import * as ZeegoContextMenu from "zeego/context-menu"
import * as Haptics from "expo-haptics"
import * as Clipboard from "expo-clipboard"
import Feather from "@expo/vector-icons/Feather"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list"
import type { Project, Session } from "@opencode-ai/sdk/client"
import { useSessions } from "../../store/sessions"
import { useConnection } from "../../store/connection"
import { useTheme } from "../../theme"
import { relative } from "../../util/format"
import { SessionListSkeleton } from "../skeleton"
import { AnimatedStatusDot } from "../status-dot"
import { client } from "../../api/client"
import { addCrashBreadcrumb } from "../../perf/crash-breadcrumbs"
import { ServerSwitcher } from "./server-switcher"

// React 19 JSX compat casts
const MenuRoot = ZeegoContextMenu.Root as React.ComponentType<{
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}>
const MenuTrigger = ZeegoContextMenu.Trigger as React.ComponentType<{
  asChild?: boolean
  action?: "press" | "longPress"
  children?: React.ReactElement
}>
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
const SESSION_SELECT_DEBOUNCE_MS = 280
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
  canSelectSession?: () => boolean
  sidebarVisible: boolean
  onServerSwitched?: () => void
}

type SectionItem = {
  project: Project
  sessions: Session[]
  count: number
  collapsed: boolean
  active: boolean
}

export const Sidebar = memo(function Sidebar({
  onSelect,
  onNew,
  onSettings,
  canSelectSession,
  sidebarVisible,
  onServerSwitched,
}: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
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
  const lastSelectAtRef = useRef(0)

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

    return orderedProjects.map((project) => {
      const sessions = grouped[project.worktree] ?? []
      const isCollapsed = collapsed[project.worktree] ?? false
      return {
        project,
        sessions,
        count: sessions.length,
        collapsed: isCollapsed,
        active: project.worktree === directory,
      }
    })
  }, [filteredSessions, projectsWithFallback, directory, collapsed])

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
    setCollapsed((state) => ({ ...state, [worktree]: !(state[worktree] ?? false) }))
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

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<SectionItem>) => {
      return (
        <ProjectSection
          item={item}
          onToggle={toggleProject}
          onNew={handleCreateSession}
          onSelect={(session) => {
            const now = Date.now()
            if (now - lastSelectAtRef.current < SESSION_SELECT_DEBOUNCE_MS) {
              addCrashBreadcrumb(
                "sidebar:select-debounced",
                {
                  sessionID: session.id,
                  sinceLastMs: now - lastSelectAtRef.current,
                },
                "warn",
              )
              return
            }
            lastSelectAtRef.current = now
            void onSelect(session)
          }}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onShare={handleShare}
          canSelectSession={canSelectSession}
        />
      )
    },
    [handleArchive, handleDelete, handleShare, onSelect, canSelectSession, toggleProject, handleCreateSession],
  )

  const keyExtractor = useCallback((item: SectionItem) => {
    return `project-${item.project.id}-${item.project.worktree}`
  }, [])

  const getItemType = useCallback(() => "project", [])

  const content = (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Threads</Text>
        <View style={styles.headerActions}>
          <HeaderIconButton icon="compose" label="New Session" onPress={() => handleCreateSession()} />
          <HeaderIconButton
            icon={allCollapsed ? "expand-all" : "collapse-all"}
            label={allCollapsed ? "Expand all projects" : "Collapse all projects"}
            onPress={toggleAll}
          />
          <HeaderIconButton icon="settings" label="Settings" onPress={onSettings} />
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
}: {
  item: SectionItem
  onToggle: (worktree: string) => void
  onNew: (worktree: string) => void
}) {
  const theme = useTheme()
  const parts = item.project.worktree.split(/[\\/]/).filter(Boolean)
  const name = parts[parts.length - 1] || item.project.worktree

  return (
    <Pressable
      style={[
        styles.projectRow,
        {
          borderColor: theme.colors.border,
          backgroundColor: item.active ? theme.colors.surface : "transparent",
          borderRadius: theme.radii.md,
        },
      ]}
      onPress={() => onToggle(item.project.worktree)}
    >
      <View style={styles.projectMain}>
        <View style={styles.projectTitleRow}>
          <FeatherIcon name="folder" size={14} color={theme.colors.textSecondary} />
          <Text style={[styles.projectTitle, { color: theme.colors.text }]} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <Text
          style={[styles.projectPath, { color: theme.colors.textTertiary }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {item.project.worktree}
        </Text>
      </View>
      <View style={styles.projectActions}>
        <Pressable
          style={[styles.projectActionButton, { backgroundColor: theme.colors.surfaceRaised }]}
          onPress={(event) => {
            event.stopPropagation()
            onNew(item.project.worktree)
          }}
          hitSlop={8}
        >
          <FeatherIcon name="plus" size={14} color={theme.colors.textSecondary} />
        </Pressable>
        <Text style={[styles.projectCount, { color: theme.colors.textTertiary }]}>{item.count}</Text>
        <FeatherIcon
          style={styles.chevronGlyph}
          name={item.collapsed ? "chevron-right" : "chevron-down"}
          size={14}
          color={theme.colors.textSecondary}
        />
      </View>
    </Pressable>
  )
})

const ProjectSection = memo(function ProjectSection({
  item,
  onToggle,
  onNew,
  onSelect,
  onArchive,
  onDelete,
  onShare,
  canSelectSession,
}: {
  item: SectionItem
  onToggle: (worktree: string) => void
  onNew: (worktree: string) => void
  onSelect: (session: Session) => void | Promise<void>
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onShare: (id: string) => void
  canSelectSession?: () => boolean
}) {
  const theme = useTheme()
  const [visibleCount, setVisibleCount] = useState(SESSION_RENDER_CHUNK)
  const visibleSessions = useMemo(
    () => item.sessions.slice(0, Math.max(SESSION_RENDER_CHUNK, visibleCount)),
    [item.sessions, visibleCount],
  )
  const remainingCount = Math.max(0, item.sessions.length - visibleSessions.length)

  useEffect(() => {
    setVisibleCount(SESSION_RENDER_CHUNK)
  }, [item.project.worktree, item.sessions.length])

  return (
    <View style={styles.projectSection}>
      <ProjectRow item={item} onToggle={onToggle} onNew={onNew} />
      {!item.collapsed && item.sessions.length > 0 ? (
        <View style={[styles.sessionGroup, { borderLeftColor: theme.colors.borderSubtle }]}>
          {visibleSessions.map((session, index) => (
            <View
              key={session.id}
              style={[styles.sessionSlot, index === visibleSessions.length - 1 && styles.sessionSlotLast]}
            >
              <SessionRow
                session={session}
                onSelect={onSelect}
                onArchive={onArchive}
                onDelete={onDelete}
                onShare={onShare}
                canSelectSession={canSelectSession}
              />
            </View>
          ))}
          {remainingCount > 0 ? (
            <Pressable
              style={({ pressed }) => [
                styles.loadMoreSessionsButton,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
                pressed && styles.headerIconButtonPressed,
              ]}
              onPress={() => setVisibleCount((count) => count + SESSION_RENDER_CHUNK)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Load more sessions"
            >
              <Text style={[styles.loadMoreSessionsText, { color: theme.colors.textSecondary }]}>
                Show {Math.min(remainingCount, SESSION_RENDER_CHUNK)} more ({remainingCount} remaining)
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  )
})

const SessionRow = memo(function SessionRow({
  session,
  onSelect,
  onArchive,
  onDelete,
  onShare,
  canSelectSession,
}: {
  session: Session
  onSelect: (session: Session) => void | Promise<void>
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onShare: (id: string) => void
  canSelectSession?: () => boolean
}) {
  const theme = useTheme()
  const selected = useSessions((s) => s.current === session.id)

  const handleMenuOpen = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }, [])

  const handleSelect = useCallback(() => {
    if (canSelectSession && !canSelectSession()) {
      addCrashBreadcrumb(
        "sidebar:select-blocked",
        {
          sessionID: session.id,
          sessionTitle: session.title || "Untitled session",
        },
        "warn",
      )
      return
    }
    void onSelect(session)
  }, [onSelect, session, canSelectSession])

  const rowBody = (
    <Pressable
      style={({ pressed }) => [
        styles.sessionRow,
        {
          backgroundColor: selected ? theme.colors.surfaceRaised : "transparent",
          borderRadius: theme.radii.md,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
      onPress={handleSelect}
      hitSlop={6}
    >
      <View style={styles.sessionMain}>
        <Text style={[styles.sessionTitle, { color: theme.colors.text }]} numberOfLines={1}>
          {session.title || "Untitled session"}
        </Text>
        <Text style={[styles.sessionMeta, { color: theme.colors.textTertiary }]}>{relative(session.time.updated)}</Text>
      </View>
    </Pressable>
  )

  return (
    <MenuRoot onOpenChange={(open) => open && handleMenuOpen()}>
      <MenuTrigger asChild action="longPress">
        {rowBody}
      </MenuTrigger>

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

const HeaderIconButton = memo(function HeaderIconButton({
  icon,
  label,
  onPress,
}: {
  icon: "compose" | "collapse-all" | "expand-all" | "settings"
  label: string
  onPress: () => void
}) {
  const theme = useTheme()
  const color = theme.colors.textSecondary
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
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
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
  },
  sessionGroup: {
    marginLeft: 22,
    marginTop: 8,
    paddingLeft: 12,
    paddingRight: 4,
    paddingBottom: 8,
    borderLeftWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  sessionSlot: {
    borderRadius: 12,
  },
  sessionSlotLast: {
    marginBottom: 2,
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
