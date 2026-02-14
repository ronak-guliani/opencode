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
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { BlurView } from "expo-blur"
import { LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass"
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
const SWIPE_SURFACE_BLUR_INTENSITY = 80
const SWIPE_SURFACE_OVERLAY_OPACITY = 0.14

type Props = {
  onSelect: (session: Session) => void | Promise<void>
  onNew: (worktree?: string) => void | Promise<void>
  onSettings: () => void
}

type SectionItem =
  | { type: "project"; project: Project; count: number; collapsed: boolean; active: boolean }
  | { type: "session"; session: Session }

export const Sidebar = memo(function Sidebar({ onSelect, onNew, onSettings }: Props) {
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

  const filteredSessions = useMemo(() => {
    if (!query.trim()) return sessions
    const q = query.toLowerCase()
    return sessions.filter((s) => {
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setCollapsed((state) => ({ ...state, [worktree]: !(state[worktree] ?? false) }))
  }, [])

  const allCollapsed = useMemo(() => {
    if (projectsWithFallback.length === 0) return false
    return projectsWithFallback.every((project) => collapsed[project.worktree] ?? false)
  }, [projectsWithFallback, collapsed])

  const toggleAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      void onNew(worktree)
    },
    [onNew],
  )

  const renderItem = useCallback(
    ({ item }: { item: SectionItem }) => {
      if (item.type === "project") {
        return <ProjectRow item={item} onToggle={toggleProject} onNew={handleCreateSession} />
      }
      return (
        <View style={styles.sessionIndent}>
          <SessionRow
            session={item.session}
            onSelect={onSelect}
            onArchive={handleArchive}
            onDelete={handleDelete}
            onShare={handleShare}
          />
        </View>
      )
    },
    [handleArchive, handleDelete, handleShare, onSelect, toggleProject, handleCreateSession],
  )

  const keyExtractor = useCallback((item: SectionItem) => {
    if (item.type === "project") return `project-${item.project.id}-${item.project.worktree}`
    return item.session.id
  }, [])

  const tint = theme.colors.background === "#09090b" ? "dark" : "light"

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
          <SearchIcon color={theme.colors.textTertiary} />
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
          <SearchIcon color={theme.colors.textTertiary} />
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

      {loading && sessions.length === 0 ? (
        <SessionListSkeleton />
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 16 }]}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={handleRefresh} tintColor={theme.colors.textTertiary} />
          }
          showsVerticalScrollIndicator={false}
          initialNumToRender={16}
          windowSize={7}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={16}
          removeClippedSubviews={false}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>No sessions found.</Text>
          }
        />
      )}
    </View>
  )

  return (
    <View style={[styles.surface, { backgroundColor: theme.colors.background }]}>
      {Platform.OS === "ios" ? (
        <View style={styles.blur}>
          <BlurView intensity={SWIPE_SURFACE_BLUR_INTENSITY} tint={tint} style={StyleSheet.absoluteFill} />
          <View
            pointerEvents="none"
            style={[
              styles.overlay,
              { backgroundColor: theme.colors.background, opacity: SWIPE_SURFACE_OVERLAY_OPACITY },
            ]}
          />
          {content}
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
  onNew,
}: {
  item: Extract<SectionItem, { type: "project" }>
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
          <FolderIcon color={theme.colors.textSecondary} />
          <Text style={[styles.projectTitle, { color: theme.colors.text }]} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <Text style={[styles.projectPath, { color: theme.colors.textTertiary }]} numberOfLines={1} ellipsizeMode="middle">
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
          <PlusIcon color={theme.colors.textSecondary} />
        </Pressable>
        <Text style={[styles.projectCount, { color: theme.colors.textTertiary }]}>{item.count}</Text>
        <Text style={[styles.chevronGlyph, { color: theme.colors.textSecondary }]}>{item.collapsed ? "›" : "⌄"}</Text>
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
  const iconNode =
    icon === "compose" ? (
      <ComposeIcon color={color} />
    ) : icon === "collapse-all" ? (
      <CollapseAllIcon color={color} mode="collapse" />
    ) : icon === "expand-all" ? (
      <CollapseAllIcon color={color} mode="expand" />
    ) : (
      <Text style={[styles.settingsGlyph, { color }]}>⚙︎</Text>
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

const FolderIcon = memo(function FolderIcon({ color }: { color: string }) {
  return (
    <View style={styles.folderIcon}>
      <View style={[styles.folderTab, { borderColor: color }]} />
      <View style={[styles.folderBody, { borderColor: color }]} />
    </View>
  )
})

const PlusIcon = memo(function PlusIcon({ color }: { color: string }) {
  return (
    <View style={styles.plusIcon}>
      <View style={[styles.plusHorizontal, { backgroundColor: color }]} />
      <View style={[styles.plusVertical, { backgroundColor: color }]} />
    </View>
  )
})

const ComposeIcon = memo(function ComposeIcon({ color }: { color: string }) {
  return (
    <View style={styles.composeIcon}>
      <View style={[styles.composeBox, { borderColor: color }]} />
      <View style={[styles.composePencilShaft, { backgroundColor: color }]} />
      <View style={[styles.composePencilTip, { borderLeftColor: color }]} />
    </View>
  )
})

const SearchIcon = memo(function SearchIcon({ color }: { color: string }) {
  return (
    <View style={styles.searchGlyph}>
      <View style={[styles.searchGlyphCircle, { borderColor: color }]} />
      <View style={[styles.searchGlyphHandle, { backgroundColor: color }]} />
    </View>
  )
})

const CollapseAllIcon = memo(function CollapseAllIcon({
  color,
  mode,
}: {
  color: string
  mode: "collapse" | "expand"
}) {
  return (
    <View style={styles.collapseAllIcon}>
      <View style={[styles.collapseLine, { backgroundColor: color }]} />
      <View style={[styles.collapseLine, { backgroundColor: color }]} />
      <Text style={[styles.collapseChevron, { color }]}>{mode === "collapse" ? "⌃" : "⌄"}</Text>
    </View>
  )
})

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
    paddingHorizontal: 10,
    gap: 4,
  },
  projectRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    marginBottom: 2,
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
    paddingLeft: 8,
    paddingRight: 8,
    paddingVertical: 11,
    gap: 8,
  },
  sessionIndent: {
    paddingLeft: 34,
    paddingRight: 4,
    paddingTop: 2,
    paddingBottom: 6,
  },
  sessionMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sessionTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "500",
  },
  sessionMeta: {
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 0,
  },
  emptyText: {
    paddingHorizontal: 18,
    paddingTop: 20,
    fontSize: 13,
  },
  chevronGlyph: {
    width: 10,
    fontSize: 16,
    lineHeight: 16,
    textAlign: "center",
  },
  settingsGlyph: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 16,
  },
  folderIcon: {
    width: 16,
    height: 12,
  },
  folderTab: {
    position: "absolute",
    top: 0,
    left: 1,
    width: 6,
    height: 4,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  folderBody: {
    position: "absolute",
    top: 3,
    left: 0,
    width: 16,
    height: 9,
    borderWidth: 1,
    borderRadius: 2,
  },
  plusIcon: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  plusHorizontal: {
    position: "absolute",
    width: 8,
    height: 1.5,
    borderRadius: 1,
  },
  plusVertical: {
    position: "absolute",
    width: 1.5,
    height: 8,
    borderRadius: 1,
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
  searchGlyph: {
    width: 14,
    height: 14,
    marginLeft: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  searchGlyphCircle: {
    width: 9,
    height: 9,
    borderWidth: 1.5,
    borderRadius: 5,
  },
  searchGlyphHandle: {
    position: "absolute",
    width: 5,
    height: 1.5,
    borderRadius: 1,
    transform: [{ translateX: 4 }, { translateY: 4 }, { rotate: "45deg" }],
  },
  collapseAllIcon: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  collapseLine: {
    width: 10,
    height: 1.5,
    borderRadius: 1,
  },
  collapseChevron: {
    position: "absolute",
    bottom: -2,
    fontSize: 10,
    lineHeight: 10,
    fontWeight: "700",
  },
})
