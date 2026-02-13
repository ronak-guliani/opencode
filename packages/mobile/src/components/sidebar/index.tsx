import { memo, useCallback, useEffect, useMemo, useState } from "react"
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as ZeegoContextMenu from "zeego/context-menu"
import * as Haptics from "expo-haptics"
import type { Project, Session } from "@opencode-ai/sdk/client"
import { useSessions } from "../../store/sessions"
import { useMessages } from "../../store/messages"
import { useConnection } from "../../store/connection"
import { scoped } from "../../api/client"
import { subscribe, unsubscribe } from "../../api/events"
import { useTheme } from "../../theme"
import { relative } from "../../util/format"
import { AnimatedStatusDot } from "../status-dot"
import { SessionListSkeleton } from "../skeleton"

type Auth = { username: string; password: string } | null
type Props = {
  onSelect: (id: string) => void
  onNew: () => void
  onSettings: () => void
  onProjectChange?: () => void
}

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

function normalize(input: string) {
  const value = input.trim()
  if (!value) return value
  if (value === "/") return value
  if (/^[A-Za-z]:[\\/]?$/.test(value)) return value
  return value.replace(/[\\/]+$/, "")
}

function basename(input: string) {
  const value = normalize(input)
  if (!value) return "Project"
  const parts = value.split(/[\\/]/).filter(Boolean)
  if (parts.length === 0) return value
  return parts[parts.length - 1]
}

function shorten(input: string) {
  const value = normalize(input)
  const parts = value.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 2) return value
  const sep = value.includes("\\") && !value.includes("/") ? "\\" : "/"
  const prefix = value.startsWith("/") ? "/" : ""
  return `${prefix}...${sep}${parts.slice(-2).join(sep)}`
}

function parse(input: string) {
  const value = normalize(input)
  const sep = value.includes("\\") && !value.includes("/") ? "\\" : "/"
  const parts = value.split(/[\\/]/)
  const name = (parts.pop() ?? "").trim()
  let parent = parts.join(sep)
  if (!parent && value.startsWith("/")) parent = "/"
  if (/^[A-Za-z]:$/.test(parent) && sep === "\\") parent += "\\"
  return {
    name,
    parent,
  }
}

function dedupe(input: string[]) {
  return [...new Set(input.map(normalize).filter(Boolean))]
}

async function suggestFolders(url: string, auth: Auth, query: string) {
  const target = normalize(query)
  if (!target) return []

  const { parent, name } = parse(target)
  if (!parent) return []

  const result = await scoped(url, parent, auth ?? undefined).file.list({
    query: { path: "." },
  })
  if (!result.data) return []

  return result.data
    .filter((item) => item.type === "directory")
    .map((item) => normalize(item.absolute))
    .filter((dir) => !name || basename(dir).toLowerCase().includes(name.toLowerCase()))
    .slice(0, 8)
}

function projectSort(a: Project, b: Project) {
  const left = a.time.initialized ?? a.time.created
  const right = b.time.initialized ?? b.time.created
  return right - left
}

export function Sidebar({ onSelect, onNew, onSettings, onProjectChange }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const sessions = useSessions((s) => s.sessions)
  const loading = useSessions((s) => s.loading)
  const fetch = useSessions((s) => s.fetch)
  const fetchStatuses = useSessions((s) => s.fetchStatuses)
  const archive = useSessions((s) => s.archive)
  const resetSessions = useSessions((s) => s.reset)
  const resetMessages = useMessages((s) => s.reset)

  const status = useConnection((s) => s.status)
  const url = useConnection((s) => s.url)
  const auth = useConnection((s) => s.auth)
  const directory = useConnection((s) => s.directory)
  const projects = useConnection((s) => s.projects)
  const refreshProjects = useConnection((s) => s.refreshProjects)
  const switchProject = useConnection((s) => s.switchProject)

  const [sessionQuery, setSessionQuery] = useState("")
  const [folderQuery, setFolderQuery] = useState("")
  const [hits, setHits] = useState<string[]>([])
  const [hitsLoading, setHitsLoading] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const filteredSessions = useMemo(() => {
    if (!sessionQuery.trim()) return sessions
    const q = sessionQuery.toLowerCase()
    return sessions.filter((session) => (session.title || "").toLowerCase().includes(q))
  }, [sessions, sessionQuery])

  const sortedProjects = useMemo(() => {
    const sorted = [...projects].sort(projectSort)
    if (directory && !sorted.find((item) => item.worktree === directory)) {
      sorted.unshift({
        id: directory,
        worktree: directory,
        time: {
          created: Date.now(),
        },
      })
    }
    return sorted
  }, [projects, directory])

  useEffect(() => {
    if (status !== "connected") return
    refreshProjects().catch(() => undefined)
  }, [status, refreshProjects])

  useEffect(() => {
    const query = normalize(folderQuery)
    if (!query) {
      setHits([])
      setHitsLoading(false)
      return
    }

    const local = sortedProjects
      .map((item) => item.worktree)
      .filter((item) => item.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 4)

    if (!url) {
      setHits(local)
      setHitsLoading(false)
      return
    }

    let live = true
    const timeout = setTimeout(() => {
      setHitsLoading(true)
      suggestFolders(url, auth, query)
        .then((remote) => {
          if (!live) return
          setHits(dedupe([...local, ...remote]))
        })
        .catch(() => {
          if (!live) return
          setHits(local)
        })
        .finally(() => {
          if (live) setHitsLoading(false)
        })
    }, 220)

    return () => {
      live = false
      clearTimeout(timeout)
    }
  }, [folderQuery, sortedProjects, url, auth])

  const refresh = useCallback(() => {
    Promise.all([fetch(), fetchStatuses(), refreshProjects()]).catch(() => undefined)
  }, [fetch, fetchStatuses, refreshProjects])

  const changeProject = useCallback(
    async (target: string) => {
      const next = normalize(target)
      if (!next || !url) return false

      setSwitching(next)
      try {
        if (next !== directory) {
          await switchProject(next)
          resetSessions()
          resetMessages()
          unsubscribe()
          subscribe()
          onProjectChange?.()
        }
        await Promise.all([fetch(), fetchStatuses(), refreshProjects()])
        return true
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unable to open project"
        Alert.alert("Unable to open project", msg)
        return false
      } finally {
        setSwitching(null)
      }
    },
    [url, directory, switchProject, fetch, fetchStatuses, refreshProjects, resetMessages, resetSessions, onProjectChange],
  )

  const handleProjectOpen = useCallback(
    async (target: string) => {
      Haptics.selectionAsync()
      await changeProject(target)
    },
    [changeProject],
  )

  const handleProjectNew = useCallback(
    async (target: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      const ok = await changeProject(target)
      if (ok) onNew()
    },
    [changeProject, onNew],
  )

  const handleAdd = useCallback(
    async (target?: string) => {
      const next = normalize(target ?? folderQuery)
      if (!next || adding) return
      setAdding(true)
      const ok = await changeProject(next)
      setAdding(false)
      if (!ok) return
      setFolderQuery("")
      setHits([])
    },
    [folderQuery, adding, changeProject],
  )

  const handleArchive = useCallback(
    async (id: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      await archive(id)
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

  const canAdd = !!normalize(folderQuery)
  const exactMatch = sortedProjects.some((item) => item.worktree === normalize(folderQuery))
  const active = directory ? basename(directory) : "Sessions"

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Threads</Text>
        <Pressable
          style={[styles.headerButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
          onPress={onNew}
        >
          <Text style={[styles.headerButtonText, { color: theme.colors.text }]}>+</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <SectionLabel label="Projects" color={theme.colors.textSecondary}>
          <FolderIcon color={theme.colors.textSecondary} />
        </SectionLabel>
        <View style={[styles.inputWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          <TextInput
            value={folderQuery}
            onChangeText={setFolderQuery}
            placeholder="Type folder path to add project"
            placeholderTextColor={theme.colors.textTertiary}
            style={[styles.input, { color: theme.colors.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => handleAdd()}
          />
          <Pressable
            style={[
              styles.inputAction,
              {
                backgroundColor: canAdd ? theme.colors.accent : theme.colors.surfaceRaised,
              },
            ]}
            onPress={() => handleAdd()}
            disabled={!canAdd || adding}
          >
            {adding ? (
              <ActivityIndicator size="small" color={theme.colors.accentText} />
            ) : (
              <Text style={[styles.inputActionText, { color: canAdd ? theme.colors.accentText : theme.colors.textTertiary }]}>
                +
              </Text>
            )}
          </Pressable>
        </View>

        {(folderQuery.trim() || hitsLoading) && (
          <View style={[styles.hitsWrap, { borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface }]}>
            {hitsLoading ? (
              <Text style={[styles.hitMeta, { color: theme.colors.textTertiary }]}>Searching folders...</Text>
            ) : null}
            {hits.map((item) => {
              const existing = sortedProjects.some((project) => project.worktree === item)
              return (
                <Pressable key={item} style={styles.hitRow} onPress={() => handleAdd(item)}>
                  <FolderIcon color={theme.colors.textTertiary} />
                  <View style={styles.hitText}>
                    <Text style={[styles.hitTitle, { color: theme.colors.text }]} numberOfLines={1}>
                      {basename(item)}
                    </Text>
                    <Text style={[styles.hitMeta, { color: theme.colors.textTertiary }]} numberOfLines={1}>
                      {item}
                    </Text>
                  </View>
                  <Text style={[styles.hitTag, { color: existing ? theme.colors.textTertiary : theme.colors.accent }]}>
                    {existing ? "Saved" : "Add"}
                  </Text>
                </Pressable>
              )
            })}
            {canAdd && !exactMatch && !hits.find((item) => item === normalize(folderQuery)) ? (
              <Pressable style={styles.hitRow} onPress={() => handleAdd()}>
                <FolderIcon color={theme.colors.textTertiary} />
                <View style={styles.hitText}>
                  <Text style={[styles.hitTitle, { color: theme.colors.text }]} numberOfLines={1}>
                    {basename(folderQuery)}
                  </Text>
                  <Text style={[styles.hitMeta, { color: theme.colors.textTertiary }]} numberOfLines={1}>
                    {normalize(folderQuery)}
                  </Text>
                </View>
                <Text style={[styles.hitTag, { color: theme.colors.accent }]}>Add</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        <View style={styles.projectList}>
          {sortedProjects.map((item) => {
            const selected = item.worktree === directory
            const busy = switching === item.worktree
            return (
              <View
                key={item.worktree}
                style={[
                  styles.projectRow,
                  {
                    backgroundColor: selected ? theme.colors.surfaceRaised : theme.colors.surface,
                    borderColor: selected ? theme.colors.border : theme.colors.borderSubtle,
                  },
                ]}
              >
                <Pressable style={styles.projectMain} onPress={() => handleProjectOpen(item.worktree)} disabled={!!switching}>
                  <FolderIcon color={selected ? theme.colors.text : theme.colors.textSecondary} />
                  <View style={styles.projectText}>
                    <Text style={[styles.projectName, { color: theme.colors.text }]} numberOfLines={1}>
                      {basename(item.worktree)}
                    </Text>
                    <Text style={[styles.projectPath, { color: theme.colors.textTertiary }]} numberOfLines={1}>
                      {shorten(item.worktree)}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  style={[
                    styles.projectAction,
                    {
                      backgroundColor: selected ? theme.colors.accent : theme.colors.surfaceRaised,
                    },
                  ]}
                  onPress={() => handleProjectNew(item.worktree)}
                  disabled={!!switching}
                >
                  {busy ? (
                    <ActivityIndicator
                      size="small"
                      color={selected ? theme.colors.accentText : theme.colors.textTertiary}
                    />
                  ) : (
                    <Text style={[styles.projectActionText, { color: selected ? theme.colors.accentText : theme.colors.text }]}>
                      +
                    </Text>
                  )}
                </Pressable>
              </View>
            )
          })}
        </View>
      </View>

      <View style={styles.section}>
        <SectionLabel label={`${active} Sessions`} color={theme.colors.textSecondary}>
          <ChatIcon color={theme.colors.textSecondary} />
        </SectionLabel>
        <View style={[styles.inputWrap, { borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface }]}>
          <TextInput
            value={sessionQuery}
            onChangeText={setSessionQuery}
            placeholder="Search sessions"
            placeholderTextColor={theme.colors.textTertiary}
            style={[styles.input, { color: theme.colors.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
        </View>
      </View>

      {loading && sessions.length === 0 ? (
        <SessionListSkeleton />
      ) : (
        <FlatList
          data={filteredSessions}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <SessionRow session={item} onSelect={onSelect} onArchive={handleArchive} onDelete={handleDelete} />
          )}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={theme.colors.textTertiary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: theme.colors.textTertiary }]}>No sessions yet</Text>
              <Text style={[styles.emptyMeta, { color: theme.colors.textTertiary }]}>Create one from any project</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <Pressable
        style={[styles.settings, { borderTopColor: theme.colors.borderSubtle, paddingBottom: insets.bottom + 8 }]}
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

  return (
    <MenuRoot
      onOpenChange={(open) => {
        if (open) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }}
    >
      <MenuTrigger>
        <Pressable
          style={[
            styles.sessionRow,
            {
              backgroundColor: selected ? theme.colors.surfaceRaised : "transparent",
              borderColor: selected ? theme.colors.borderSubtle : "transparent",
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
          <Text style={[styles.sessionTime, { color: theme.colors.textTertiary }]}>{relative(session.time.updated)}</Text>
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
  )
})

function SectionLabel({
  label,
  color,
  children,
}: {
  label: string
  color: string
  children: React.ReactNode
}) {
  return (
    <View style={styles.sectionLabel}>
      {children}
      <Text style={[styles.sectionLabelText, { color }]}>{label}</Text>
    </View>
  )
}

function FolderIcon({ color }: { color: string }) {
  return (
    <View style={styles.folder}>
      <View style={[styles.folderTab, { backgroundColor: color }]} />
      <View style={[styles.folderBody, { borderColor: color }]} />
    </View>
  )
}

function ChatIcon({ color }: { color: string }) {
  return (
    <View style={styles.chat}>
      <View style={[styles.chatBody, { borderColor: color }]} />
      <View style={[styles.chatTail, { borderTopColor: color }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  headerButton: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    alignItems: "center",
  },
  headerButtonText: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "600",
  },
  section: {
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  sectionLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  sectionLabelText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  inputWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  input: {
    flex: 1,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inputAction: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
  },
  inputActionText: {
    fontSize: 18,
    lineHeight: 19,
    fontWeight: "600",
  },
  hitsWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    marginBottom: 8,
    overflow: "hidden",
  },
  hitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  hitText: {
    flex: 1,
  },
  hitTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  hitMeta: {
    fontSize: 11,
    marginTop: 1,
  },
  hitTag: {
    fontSize: 11,
    fontWeight: "600",
  },
  projectList: {
    gap: 6,
  },
  projectRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: "hidden",
  },
  projectMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  projectText: {
    flex: 1,
  },
  projectName: {
    fontSize: 14,
    fontWeight: "600",
  },
  projectPath: {
    fontSize: 11,
    marginTop: 1,
  },
  projectAction: {
    width: 34,
    height: 34,
    borderRadius: 9,
    marginRight: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  projectActionText: {
    fontSize: 18,
    lineHeight: 19,
    fontWeight: "600",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 2,
  },
  sessionTitle: {
    flex: 1,
    fontSize: 14,
  },
  sessionTime: {
    fontSize: 11,
  },
  empty: {
    alignItems: "center",
    paddingTop: 24,
    gap: 2,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  emptyMeta: {
    fontSize: 11,
  },
  settings: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  settingsText: {
    fontSize: 14,
  },
  folder: {
    width: 14,
    height: 11,
  },
  folderTab: {
    width: 6,
    height: 2,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    marginLeft: 2,
    marginBottom: 1,
  },
  folderBody: {
    width: 14,
    height: 8,
    borderWidth: 1,
    borderRadius: 2,
  },
  chat: {
    width: 14,
    height: 11,
  },
  chatBody: {
    width: 12,
    height: 8,
    borderWidth: 1,
    borderRadius: 3,
  },
  chatTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 3,
    borderRightWidth: 1,
    borderTopWidth: 3,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginLeft: 3,
    marginTop: -1,
  },
})
