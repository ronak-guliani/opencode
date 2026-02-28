import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { useRouter } from "expo-router"
import { LiquidGlassContainerView, LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass"
import { bootstrap } from "../../api/bootstrap"
import { useConnection } from "../../store/connection"
import { useSessions } from "../../store/sessions"
import { useTheme } from "../../theme"
import { normalizeServerUrl, serverDisplayName } from "../../util/server"

type Props = {
  sidebarVisible: boolean
  onServerSwitched?: () => void
}

type HealthState = "checking" | "online" | "offline"

type HealthItem = {
  state: HealthState
  version?: string
  checkedAt: number
}

const Glass = LiquidGlassView as React.ComponentType<{
  interactive?: boolean
  effect?: "clear" | "regular" | "none"
  tintColor?: string
  colorScheme?: "light" | "dark" | "system"
  style?: unknown
  children?: React.ReactNode
}>
const GlassContainer = LiquidGlassContainerView as React.ComponentType<{
  spacing?: number
  style?: unknown
  children?: React.ReactNode
}>

const AUTO_POLL_MS = 12_000
const AUTO_SKIP_AFTER_MANUAL_MS = 5_000

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "Request failed"
}

function statusColor(state: HealthState, palette: ReturnType<typeof useTheme>["colors"]) {
  if (state === "online") return palette.success
  if (state === "offline") return palette.error
  return palette.textTertiary
}

function statusText(state: HealthState) {
  if (state === "online") return "Online"
  if (state === "offline") return "Offline"
  return "Checking"
}

export const ServerSwitcher = memo(function ServerSwitcher({ sidebarVisible, onServerSwitched }: Props) {
  const theme = useTheme()
  const isDark = theme.colors.background === "#09090b"
  const glassColorScheme: "dark" | "light" = isDark ? "dark" : "light"
  const glassTint = isDark ? "rgba(9,9,12,0.28)" : "rgba(255,255,255,0.28)"
  const panelTint = theme.colors.background + (isDark ? "cc" : "dc")
  const panelBorder = theme.colors.border + (isDark ? "99" : "88")
  const router = useRouter()
  const osMajor = typeof Platform.Version === "string" ? parseInt(Platform.Version, 10) : Platform.Version
  const expectsNativeGlass = Platform.OS === "ios" && Number.isFinite(osMajor) && Number(osMajor) >= 26
  const missingNativeGlass = expectsNativeGlass && !isLiquidGlassSupported
  const servers = useConnection((s) => s.servers)
  const activeServerUrl = useConnection((s) => s.activeServerUrl)
  const connectionStatus = useConnection((s) => s.status)
  const activeVersion = useConnection((s) => s.serverVersion)
  const connect = useConnection((s) => s.connect)
  const saveServer = useConnection((s) => s.saveServer)
  const probeServers = useConnection((s) => s.probeServers)

  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState)
  const [listOpen, setListOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [health, setHealth] = useState<Record<string, HealthItem>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [switchingURL, setSwitchingURL] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [addServerURL, setAddServerURL] = useState("")
  const [addAuthEnabled, setAddAuthEnabled] = useState(false)
  const [addUsername, setAddUsername] = useState("")
  const [addPassword, setAddPassword] = useState("")
  const [addingServer, setAddingServer] = useState(false)

  const refreshControllerRef = useRef<AbortController | null>(null)
  const refreshTokenRef = useRef(0)
  const manualRefreshTokenRef = useRef<number | null>(null)
  const lastManualRefreshAtRef = useRef(0)

  const serverSignature = useMemo(() => servers.map((server) => server.url).join("|"), [servers])
  const selectedServerUrl = activeServerUrl ?? servers[0]?.url ?? null
  const selectedServerName = selectedServerUrl ? serverDisplayName(selectedServerUrl) : "Select a server"

  const resolveHealth = useCallback(
    (url: string): HealthItem => {
      const existing = health[url]
      if (existing) return existing
      if (url === activeServerUrl && connectionStatus === "connected") {
        return {
          state: "online",
          version: activeVersion ?? undefined,
          checkedAt: Date.now(),
        }
      }
      return {
        state: "checking",
        checkedAt: 0,
      }
    },
    [activeServerUrl, activeVersion, connectionStatus, health],
  )

  const refreshHealth = useCallback(
    async (mode: "manual" | "auto" | "targeted", targetUrls?: string[]) => {
      const urls = (targetUrls?.length ? targetUrls : servers.map((server) => server.url))
        .map((url) => normalizeServerUrl(url))
        .filter((url): url is string => !!url)

      if (urls.length === 0) return
      if (mode === "auto" && Date.now() - lastManualRefreshAtRef.current < AUTO_SKIP_AFTER_MANUAL_MS) return

      if (manualRefreshTokenRef.current !== null) {
        setRefreshing(false)
        manualRefreshTokenRef.current = null
      }

      refreshControllerRef.current?.abort()
      const controller = new AbortController()
      refreshControllerRef.current = controller
      const token = ++refreshTokenRef.current

      if (mode === "manual") {
        manualRefreshTokenRef.current = token
        lastManualRefreshAtRef.current = Date.now()
        setRefreshing(true)
      }

      setHealth((previous) => {
        const next = { ...previous }
        for (const url of urls) {
          const current = next[url]
          if (url === activeServerUrl && connectionStatus === "connected") {
            next[url] = {
              state: "online",
              version: activeVersion ?? current?.version,
              checkedAt: current?.checkedAt ?? Date.now(),
            }
            continue
          }
          next[url] = {
            state: "checking",
            version: current?.version,
            checkedAt: current?.checkedAt ?? 0,
          }
        }
        return next
      })

      try {
        const result = await probeServers(urls, {
          timeoutMs: 2_800,
          retryCount: 1,
          retryDelayMs: 100,
          signal: controller.signal,
        })
        if (refreshTokenRef.current !== token) return

        setHealth((previous) => {
          const next = { ...previous }
          const now = Date.now()
          for (const url of urls) {
            const item = result[url]
            next[url] = {
              state: item?.healthy ? "online" : "offline",
              version: item?.version ?? previous[url]?.version,
              checkedAt: now,
            }
          }
          return next
        })
      } catch {
        if (refreshTokenRef.current !== token || controller.signal.aborted) return
        setHealth((previous) => {
          const next = { ...previous }
          const now = Date.now()
          for (const url of urls) {
            next[url] = {
              state: "offline",
              version: previous[url]?.version,
              checkedAt: now,
            }
          }
          return next
        })
      } finally {
        if (manualRefreshTokenRef.current === token) {
          manualRefreshTokenRef.current = null
          setRefreshing(false)
        }
        if (refreshControllerRef.current === controller) {
          refreshControllerRef.current = null
        }
      }
    },
    [activeServerUrl, activeVersion, connectionStatus, probeServers, servers],
  )

  const handleSwitchServer = useCallback(
    async (targetUrl: string) => {
      const item = resolveHealth(targetUrl)
      if (item.state === "offline") {
        setListError("Server is offline. Refresh and try again.")
        return
      }

      setListError(null)
      setSwitchingURL(targetUrl)
      try {
        await connect(targetUrl)
        const result = await bootstrap()
        if (result.status === "error") {
          throw new Error(result.error ?? "Bootstrap failed")
        }
        await Promise.all([useSessions.getState().fetch(), useSessions.getState().fetchStatuses()])
        setListOpen(false)
        router.replace("/(main)/session")
        onServerSwitched?.()
      } catch (error) {
        setListError(toErrorMessage(error))
      } finally {
        setSwitchingURL(null)
      }
    },
    [connect, onServerSwitched, resolveHealth, router],
  )

  const handleAddServer = useCallback(async () => {
    const normalized = normalizeServerUrl(addServerURL)
    if (!normalized) {
      setAddError("Server URL is invalid")
      return
    }

    const auth = addAuthEnabled && addUsername.trim() ? { username: addUsername.trim(), password: addPassword } : undefined

    setAddingServer(true)
    setAddError(null)

    try {
      await saveServer(normalized, auth)
      setAddServerURL("")
      setAddAuthEnabled(false)
      setAddUsername("")
      setAddPassword("")
      await refreshHealth("targeted", [normalized])
      setAddOpen(false)
      setListOpen(true)
    } catch (error) {
      setAddError(toErrorMessage(error))
    } finally {
      setAddingServer(false)
    }
  }, [addAuthEnabled, addPassword, addServerURL, addUsername, refreshHealth, saveServer])

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState)
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    return () => {
      refreshControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    setHealth((previous) => {
      const next: Record<string, HealthItem> = {}
      for (const server of servers) {
        const existing = previous[server.url]
        if (existing) {
          next[server.url] = existing
          continue
        }
        if (server.url === activeServerUrl && connectionStatus === "connected") {
          next[server.url] = {
            state: "online",
            version: activeVersion ?? undefined,
            checkedAt: Date.now(),
          }
          continue
        }
        next[server.url] = {
          state: "checking",
          checkedAt: 0,
        }
      }
      return next
    })
  }, [activeServerUrl, activeVersion, connectionStatus, servers])

  useEffect(() => {
    if (!sidebarVisible || appState !== "active" || !listOpen || servers.length === 0) return
    void refreshHealth("auto")
    const timer = setInterval(() => {
      void refreshHealth("auto")
    }, AUTO_POLL_MS)
    return () => clearInterval(timer)
  }, [appState, listOpen, refreshHealth, serverSignature, servers.length, sidebarVisible])

  const selectedHealth = selectedServerUrl ? resolveHealth(selectedServerUrl) : null

  const compactControl = (
    <Pressable
      style={({ pressed }) => [styles.selectorButton, pressed && styles.pressed]}
      onPress={() => {
        setListError(null)
        setListOpen(true)
        void refreshHealth("auto")
      }}
      accessibilityRole="button"
      accessibilityLabel="Open server switcher"
      hitSlop={8}
    >
      <View
        style={[
          styles.statusDot,
          { backgroundColor: selectedHealth ? statusColor(selectedHealth.state, theme.colors) : theme.colors.textTertiary },
        ]}
      />
      <Text style={[styles.selectorTitle, { color: theme.colors.text }]} numberOfLines={1}>
        {selectedServerName}
      </Text>
      <Text style={[styles.selectorState, { color: theme.colors.textTertiary }]}>
        {selectedHealth ? statusText(selectedHealth.state) : "Disconnected"}
      </Text>
      <Text style={[styles.chevron, { color: theme.colors.textSecondary }]}>⌄</Text>
    </Pressable>
  )

  const addButton = (
    <Pressable
      style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
      onPress={() => {
        setAddError(null)
        setListOpen(false)
        setAddOpen(true)
      }}
      accessibilityRole="button"
      accessibilityLabel="Add server"
      hitSlop={8}
    >
      <Text style={[styles.addButtonText, { color: theme.colors.text }]}>＋</Text>
    </Pressable>
  )

  return (
    <>
      <View style={styles.compactRow}>
        {isLiquidGlassSupported ? (
          <GlassContainer spacing={8} style={styles.compactRowGlass}>
            <Glass
              interactive
              effect="regular"
              colorScheme={glassColorScheme}
              tintColor={glassTint}
              style={styles.selectorGlass}
            >
              {compactControl}
            </Glass>
            <Glass
              interactive
              effect="regular"
              colorScheme={glassColorScheme}
              tintColor={glassTint}
              style={styles.addGlass}
            >
              {addButton}
            </Glass>
          </GlassContainer>
        ) : (
          <>
            <View
              style={[
                styles.selectorFallback,
                {
                  backgroundColor: theme.colors.surface + (isDark ? "c2" : "d9"),
                  borderColor: theme.colors.border + "80",
                },
              ]}
            >
              {compactControl}
            </View>
            <View
              style={[
                styles.addFallback,
                {
                  backgroundColor: theme.colors.surface + (isDark ? "c2" : "d9"),
                  borderColor: theme.colors.border + "80",
                },
              ]}
            >
              {addButton}
            </View>
          </>
        )}
      </View>

      <Modal visible={listOpen} transparent animationType="fade" onRequestClose={() => setListOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setListOpen(false)} />
          <View style={styles.popoverWrap}>
            {isLiquidGlassSupported ? (
              <Glass
                interactive
                effect="regular"
                colorScheme={glassColorScheme}
                tintColor={glassTint}
                style={[styles.popoverGlass, { borderColor: panelBorder }]}
              >
                <View style={[styles.surfaceTone, { backgroundColor: panelTint }]}>
                  <ServerListPopover
                    servers={servers}
                    activeServerUrl={activeServerUrl}
                    connectionStatus={connectionStatus}
                    resolveHealth={resolveHealth}
                    switchingURL={switchingURL}
                    refreshing={refreshing}
                    listError={listError}
                    onRefresh={() => void refreshHealth("manual")}
                    onConnect={(url) => void handleSwitchServer(url)}
                    onOpenAdd={() => {
                      setListOpen(false)
                      setAddOpen(true)
                    }}
                    missingNativeGlass={missingNativeGlass}
                  />
                </View>
              </Glass>
            ) : (
              <View
                style={[
                  styles.popoverFallback,
                  {
                    backgroundColor: theme.colors.surface + (isDark ? "d4" : "ef"),
                    borderColor: panelBorder,
                  },
                ]}
              >
                <ServerListPopover
                  servers={servers}
                  activeServerUrl={activeServerUrl}
                  connectionStatus={connectionStatus}
                  resolveHealth={resolveHealth}
                  switchingURL={switchingURL}
                  refreshing={refreshing}
                  listError={listError}
                  onRefresh={() => void refreshHealth("manual")}
                  onConnect={(url) => void handleSwitchServer(url)}
                  onOpenAdd={() => {
                    setListOpen(false)
                    setAddOpen(true)
                  }}
                  missingNativeGlass={missingNativeGlass}
                />
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setAddOpen(false)} />
          <View style={styles.popoverWrap}>
            {isLiquidGlassSupported ? (
              <Glass
                interactive
                effect="regular"
                colorScheme={glassColorScheme}
                tintColor={glassTint}
                style={[styles.popoverGlass, { borderColor: panelBorder }]}
              >
                <View style={[styles.surfaceTone, { backgroundColor: panelTint }]}>
                  <AddServerPopover
                    addServerURL={addServerURL}
                    setAddServerURL={setAddServerURL}
                    addAuthEnabled={addAuthEnabled}
                    setAddAuthEnabled={setAddAuthEnabled}
                    addUsername={addUsername}
                    setAddUsername={setAddUsername}
                    addPassword={addPassword}
                    setAddPassword={setAddPassword}
                    addingServer={addingServer}
                    addError={addError}
                    onClose={() => setAddOpen(false)}
                    onSave={() => void handleAddServer()}
                  />
                </View>
              </Glass>
            ) : (
              <View
                style={[
                  styles.popoverFallback,
                  {
                    backgroundColor: theme.colors.surface + (isDark ? "d4" : "ef"),
                    borderColor: panelBorder,
                  },
                ]}
              >
                <AddServerPopover
                  addServerURL={addServerURL}
                  setAddServerURL={setAddServerURL}
                  addAuthEnabled={addAuthEnabled}
                  setAddAuthEnabled={setAddAuthEnabled}
                  addUsername={addUsername}
                  setAddUsername={setAddUsername}
                  addPassword={addPassword}
                  setAddPassword={setAddPassword}
                  addingServer={addingServer}
                  addError={addError}
                  onClose={() => setAddOpen(false)}
                  onSave={() => void handleAddServer()}
                />
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  )
})

const ServerListPopover = memo(function ServerListPopover({
  servers,
  activeServerUrl,
  connectionStatus,
  resolveHealth,
  switchingURL,
  refreshing,
  listError,
  onRefresh,
  onConnect,
  onOpenAdd,
  missingNativeGlass,
}: {
  servers: Array<{ url: string; username?: string }>
  activeServerUrl: string | null
  connectionStatus: string
  resolveHealth: (url: string) => HealthItem
  switchingURL: string | null
  refreshing: boolean
  listError: string | null
  onRefresh: () => void
  onConnect: (url: string) => void
  onOpenAdd: () => void
  missingNativeGlass: boolean
}) {
  const theme = useTheme()
  const isDark = theme.colors.background === "#09090b"
  const chromeSurface = theme.colors.surface + (isDark ? "a8" : "dc")
  const chromeBorder = theme.colors.border + "75"
  const rowSurface = theme.colors.surface + (isDark ? "96" : "d8")

  return (
    <View style={styles.popoverInner}>
      <View style={styles.popoverHeader}>
        <Text style={[styles.popoverTitle, { color: theme.colors.text }]}>Servers</Text>
        <View style={styles.popoverHeaderActions}>
          <Pressable
            style={({ pressed }) => [
              styles.headerButton,
              { borderColor: chromeBorder, backgroundColor: chromeSurface },
              pressed && styles.pressed,
            ]}
            onPress={onRefresh}
            hitSlop={8}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            ) : (
              <Text style={[styles.headerButtonGlyph, { color: theme.colors.textSecondary }]}>↻</Text>
            )}
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.headerButton,
              { borderColor: chromeBorder, backgroundColor: chromeSurface },
              pressed && styles.pressed,
            ]}
            onPress={onOpenAdd}
            hitSlop={8}
          >
            <Text style={[styles.headerButtonGlyph, { color: theme.colors.textSecondary }]}>＋</Text>
          </Pressable>
        </View>
      </View>

      {listError ? <Text style={[styles.errorText, { color: theme.colors.error }]}>{listError}</Text> : null}
      {missingNativeGlass ? (
        <Text style={[styles.hintText, { color: theme.colors.warning }]}>
          Native Liquid Glass is unavailable in this build. Reinstall/rebuild the iOS app binary.
        </Text>
      ) : null}

      <ScrollView style={styles.serverList} contentContainerStyle={styles.serverListContent} showsVerticalScrollIndicator={false}>
        {servers.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>No saved servers.</Text>
        ) : (
          servers.map((server) => {
            const health = resolveHealth(server.url)
            const isActive = server.url === activeServerUrl && connectionStatus === "connected"
            const isSwitching = switchingURL === server.url
            const canConnect = !isActive && !switchingURL

            return (
              <View
                key={server.url}
                style={[styles.serverRow, { borderColor: chromeBorder, backgroundColor: rowSurface }]}
              >
                <View style={[styles.statusDot, { backgroundColor: statusColor(health.state, theme.colors) }]} />
                <View style={styles.serverMeta}>
                  <Text style={[styles.serverName, { color: theme.colors.text }]} numberOfLines={1}>
                    {serverDisplayName(server.url)}
                  </Text>
                  <View style={styles.serverSubRow}>
                    <Text style={[styles.serverSubText, { color: theme.colors.textTertiary }]}>{statusText(health.state)}</Text>
                    {health.version ? <Text style={[styles.serverSubText, { color: theme.colors.textTertiary }]}>v{health.version}</Text> : null}
                    {server.username ? <Text style={[styles.serverSubText, { color: theme.colors.textTertiary }]}>auth:{server.username}</Text> : null}
                  </View>
                </View>
                {isActive ? (
                  <Text style={[styles.connectedText, { color: theme.colors.accent }]}>Connected</Text>
                ) : (
                  <Pressable
                    style={({ pressed }) => [
                      styles.connectButton,
                      {
                        borderColor: chromeBorder,
                        backgroundColor: chromeSurface,
                        opacity: canConnect ? 1 : 0.6,
                      },
                      pressed && styles.pressed,
                    ]}
                    onPress={() => onConnect(server.url)}
                    disabled={!canConnect}
                  >
                    <Text style={[styles.connectText, { color: theme.colors.accent }]}>
                      {isSwitching ? "Connecting..." : "Connect"}
                    </Text>
                  </Pressable>
                )}
              </View>
            )
          })
        )}
      </ScrollView>
    </View>
  )
})

const AddServerPopover = memo(function AddServerPopover({
  addServerURL,
  setAddServerURL,
  addAuthEnabled,
  setAddAuthEnabled,
  addUsername,
  setAddUsername,
  addPassword,
  setAddPassword,
  addingServer,
  addError,
  onClose,
  onSave,
}: {
  addServerURL: string
  setAddServerURL: (value: string) => void
  addAuthEnabled: boolean
  setAddAuthEnabled: (value: boolean) => void
  addUsername: string
  setAddUsername: (value: string) => void
  addPassword: string
  setAddPassword: (value: string) => void
  addingServer: boolean
  addError: string | null
  onClose: () => void
  onSave: () => void
}) {
  const theme = useTheme()
  const isDark = theme.colors.background === "#09090b"
  const chromeSurface = theme.colors.surface + (isDark ? "a8" : "dc")
  const chromeBorder = theme.colors.border + "75"

  return (
    <View style={styles.popoverInner}>
      <View style={styles.popoverHeader}>
        <Text style={[styles.popoverTitle, { color: theme.colors.text }]}>Add Server</Text>
        <Pressable
          style={({ pressed }) => [
            styles.headerButton,
            { borderColor: chromeBorder, backgroundColor: chromeSurface },
            pressed && styles.pressed,
          ]}
          onPress={onClose}
          hitSlop={8}
        >
          <Text style={[styles.headerButtonGlyph, { color: theme.colors.textSecondary }]}>✕</Text>
        </Pressable>
      </View>

      <TextInput
        style={[styles.input, { borderColor: chromeBorder, color: theme.colors.text, backgroundColor: chromeSurface }]}
        value={addServerURL}
        onChangeText={setAddServerURL}
        placeholder="https://your-server.ngrok.io"
        placeholderTextColor={theme.colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!addingServer}
        returnKeyType="done"
        onSubmitEditing={onSave}
      />

      <Pressable onPress={() => setAddAuthEnabled(!addAuthEnabled)} disabled={addingServer} hitSlop={8}>
        <Text style={[styles.authToggle, { color: theme.colors.accent }]}>
          {addAuthEnabled ? "Hide authentication" : "Add authentication"}
        </Text>
      </Pressable>

      {addAuthEnabled ? (
        <View style={styles.authInputs}>
          <TextInput
            style={[styles.input, { borderColor: chromeBorder, color: theme.colors.text, backgroundColor: chromeSurface }]}
            value={addUsername}
            onChangeText={setAddUsername}
            placeholder="Username"
            placeholderTextColor={theme.colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!addingServer}
          />
          <TextInput
            style={[styles.input, { borderColor: chromeBorder, color: theme.colors.text, backgroundColor: chromeSurface }]}
            value={addPassword}
            onChangeText={setAddPassword}
            placeholder="Password"
            placeholderTextColor={theme.colors.textTertiary}
            autoCapitalize="none"
            secureTextEntry
            editable={!addingServer}
          />
        </View>
      ) : null}

      {addError ? <Text style={[styles.errorText, { color: theme.colors.error }]}>{addError}</Text> : null}

      <Pressable
        style={({ pressed }) => [
          styles.saveButton,
          {
            backgroundColor: theme.colors.accent,
            opacity: addingServer || !addServerURL.trim() ? 0.6 : 1,
          },
          pressed && styles.pressed,
        ]}
        onPress={onSave}
        disabled={addingServer || !addServerURL.trim()}
      >
        {addingServer ? <ActivityIndicator color={theme.colors.accentText} /> : <Text style={[styles.saveText, { color: theme.colors.accentText }]}>Save Server</Text>}
      </Pressable>
    </View>
  )
})

const styles = StyleSheet.create({
  compactRow: {
    marginHorizontal: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  compactRowGlass: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectorGlass: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    minHeight: 38,
    justifyContent: "center",
  },
  selectorFallback: {
    flex: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 38,
    justifyContent: "center",
  },
  selectorButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectorTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  selectorState: {
    fontSize: 11,
  },
  chevron: {
    fontSize: 12,
  },
  addGlass: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  addFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  addButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: {
    fontSize: 18,
    lineHeight: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  modalRoot: {
    flex: 1,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  popoverWrap: {
    paddingHorizontal: 16,
    paddingTop: 86,
  },
  popoverGlass: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  surfaceTone: {
    borderRadius: 28,
  },
  popoverFallback: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  popoverInner: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    maxHeight: 430,
  },
  popoverHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  popoverTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  popoverHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  headerButtonGlyph: {
    fontSize: 13,
    lineHeight: 14,
    fontWeight: "700",
  },
  serverList: {
    maxHeight: 330,
  },
  serverListContent: {
    gap: 8,
    paddingBottom: 2,
  },
  serverRow: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  serverMeta: {
    flex: 1,
    gap: 2,
  },
  serverName: {
    fontSize: 13,
    fontWeight: "600",
  },
  serverSubRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  serverSubText: {
    fontSize: 11,
  },
  connectedText: {
    fontSize: 12,
    fontWeight: "700",
  },
  connectButton: {
    minHeight: 30,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  connectText: {
    fontSize: 12,
    fontWeight: "600",
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  authToggle: {
    fontSize: 13,
    fontWeight: "500",
  },
  authInputs: {
    gap: 8,
  },
  saveButton: {
    borderRadius: 10,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: {
    fontSize: 13,
    fontWeight: "700",
  },
  emptyText: {
    fontSize: 13,
  },
  errorText: {
    fontSize: 12,
  },
  hintText: {
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.7,
  },
})
