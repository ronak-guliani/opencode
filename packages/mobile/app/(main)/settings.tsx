import { useCallback, useMemo, useState } from "react"
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  Modal,
  TextInput,
  Linking,
  ActivityIndicator,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useTheme, type Theme } from "../../src/theme"
import { useConnection } from "../../src/store/connection"
import { useSettings } from "../../src/store/settings"
import { client, headers as clientHeaders, url as clientUrl } from "../../src/api/client"
import { connectAndBootstrap } from "../../src/features/connection/connect-and-bootstrap"
import { toErrorMessage } from "../../src/util/error-message"
import { serverDisplayName } from "../../src/util/server"

type Method = { type: string; label: string }
type Authorization = { url: string; method: "auto" | "code"; instructions: string }
type FlowStep = "method" | "api" | "oauth_code" | "oauth_auto"

type Flow = {
  providerID: string
  providerName: string
  methods: Method[]
  methodIndex?: number
  authorization?: Authorization
  step: FlowStep
  error?: string
}

type ProviderRow = {
  id: string
  name: string
  source?: string
}

const EMPTY_CONNECTED: string[] = []
const POPULAR_PROVIDERS = ["opencode", "anthropic", "github-copilot", "openai", "google", "openrouter", "vercel"]

const APPEARANCES = [
  { value: "system" as const, label: "System" },
  { value: "light" as const, label: "Light" },
  { value: "dark" as const, label: "Dark" },
]

function compareProviders(a: ProviderRow, b: ProviderRow) {
  const ai = POPULAR_PROVIDERS.indexOf(a.id)
  const bi = POPULAR_PROVIDERS.indexOf(b.id)
  const aPopular = ai >= 0
  const bPopular = bi >= 0
  if (aPopular && !bPopular) return -1
  if (!aPopular && bPopular) return 1
  if (aPopular && bPopular && ai !== bi) return ai - bi
  return a.name.localeCompare(b.name)
}

function endpoint(base: string, path: string) {
  if (base.endsWith("/")) return `${base.slice(0, -1)}${path}`
  return `${base}${path}`
}

export default function SettingsScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const serverURL = useConnection((s) => s.url)
  const servers = useConnection((s) => s.servers)
  const activeServerUrl = useConnection((s) => s.activeServerUrl)
  const status = useConnection((s) => s.status)
  const serverVersion = useConnection((s) => s.serverVersion)
  const removeServer = useConnection((s) => s.removeServer)
  const disconnect = useConnection((s) => s.disconnect)

  const providerData = useSettings((s) => s.providerData)
  const providerAuth = useSettings((s) => s.providerAuth)
  const connected = useSettings((s) => s.providerData?.connected) ?? EMPTY_CONNECTED
  const fetchProviders = useSettings((s) => s.fetchProviders)
  const fetchProviderAuth = useSettings((s) => s.fetchProviderAuth)

  const appearance = useSettings((s) => s.appearance)
  const setAppearance = useSettings((s) => s.setAppearance)

  const [flow, setFlow] = useState<Flow | null>(null)
  const [pending, setPending] = useState(false)
  const [providerBusy, setProviderBusy] = useState<string | null>(null)
  const [serverBusy, setServerBusy] = useState<string | null>(null)
  const [serverBusyAction, setServerBusyAction] = useState<"connect" | "remove" | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [oauthCode, setOauthCode] = useState("")

  const connectedSet = useMemo(() => new Set(connected), [connected])

  const providers = useMemo(() => {
    const list = providerData?.all ?? []
    return list
      .map((provider) => {
        const source = (provider as { source?: unknown }).source
        return {
          id: provider.id,
          name: provider.name || provider.id,
          source: typeof source === "string" ? source : undefined,
        }
      })
      .sort(compareProviders)
  }, [providerData])

  const connectedProviders = useMemo(() => providers.filter((item) => connectedSet.has(item.id)), [providers, connectedSet])
  const availableProviders = useMemo(() => providers.filter((item) => !connectedSet.has(item.id)), [providers, connectedSet])

  const refreshProviders = useCallback(async () => {
    await Promise.all([fetchProviders(), fetchProviderAuth()])
  }, [fetchProviderAuth, fetchProviders])

  const setFlowError = useCallback((value: string) => {
    setFlow((state) => {
      if (!state) return state
      return { ...state, error: value }
    })
  }, [])

  const closeFlow = useCallback(() => {
    if (pending) return
    setFlow(null)
    setApiKey("")
    setOauthCode("")
  }, [pending])

  const openAuthorization = useCallback((authorization?: Authorization) => {
    if (!authorization?.url) return
    Linking.openURL(authorization.url).catch(() => undefined)
  }, [])

  const completeConnect = useCallback(async () => {
    await refreshProviders()
    setPending(false)
    setFlow(null)
    setApiKey("")
    setOauthCode("")
    setProviderError(null)
  }, [refreshProviders])

  const startMethod = useCallback(
    async (state: Flow, index: number) => {
      const method = state.methods[index]
      if (!method) return

      if (method.type === "api") {
        setApiKey("")
        setFlow({
          ...state,
          methodIndex: index,
          step: "api",
          error: undefined,
        })
        return
      }

      setPending(true)
      setFlow({
        ...state,
        methodIndex: index,
        error: undefined,
      })

      const authorization = await client().provider.oauth
        .authorize({
          path: { id: state.providerID },
          body: { method: index },
        })
        .catch((error) => ({ error }))

      if ("error" in authorization && authorization.error) {
        setPending(false)
        setFlow({
          ...state,
          step: "method",
          error: toErrorMessage(authorization.error),
        })
        return
      }

      const auth = "data" in authorization ? (authorization.data as Authorization | undefined) : undefined
      if (!auth) {
        setPending(false)
        setFlow({
          ...state,
          step: "method",
          error: "No authorization payload received",
        })
        return
      }
      openAuthorization(auth)

      if (auth.method === "code") {
        setPending(false)
        setOauthCode("")
        setFlow({
          ...state,
          methodIndex: index,
          authorization: auth,
          step: "oauth_code",
          error: undefined,
        })
        return
      }

      setFlow({
        ...state,
        methodIndex: index,
        authorization: auth,
        step: "oauth_auto",
        error: undefined,
      })

      const callback = await client().provider.oauth
        .callback({
          path: { id: state.providerID },
          body: { method: index },
        })
        .catch((error) => ({ error }))

      if ("error" in callback && callback.error) {
        setPending(false)
        setFlowError(toErrorMessage(callback.error))
        return
      }

      await completeConnect()
    },
    [completeConnect, openAuthorization, setFlowError],
  )

  const connectProvider = useCallback(
    async (providerID: string, providerName: string) => {
      const methods = providerAuth?.[providerID] ?? [{ type: "api", label: "API key" }]
      const next: Flow = {
        providerID,
        providerName,
        methods,
        step: methods.length > 1 ? "method" : methods[0]?.type === "api" ? "api" : "method",
      }

      setFlow(next)
      setApiKey("")
      setOauthCode("")
      setProviderError(null)

      if (methods.length === 1 && methods[0]?.type === "oauth") {
        await startMethod(next, 0)
      }
    },
    [providerAuth, startMethod],
  )

  const disconnectProvider = useCallback(
    async (providerID: string) => {
      setProviderBusy(providerID)
      setProviderError(null)

      const result = await fetch(endpoint(clientUrl(), `/auth/${encodeURIComponent(providerID)}`), {
        method: "DELETE",
        headers: {
          ...clientHeaders(),
        },
      })
        .then((response) => ({ response }))
        .catch((error) => ({ error }))

      if ("error" in result) {
        setProviderBusy(null)
        setProviderError(toErrorMessage(result.error))
        return
      }

      if (!result.response.ok) {
        setProviderBusy(null)
        setProviderError(`Failed to disconnect provider (${result.response.status})`)
        return
      }

      await refreshProviders()
      setProviderBusy(null)
    },
    [refreshProviders],
  )

  const submitApiKey = useCallback(async () => {
    if (!flow || flow.step !== "api") return
    if (!apiKey.trim()) {
      setFlowError("API key is required")
      return
    }

    setPending(true)
    const result = await client().auth
      .set({
        path: { id: flow.providerID },
        body: {
          type: "api",
          key: apiKey.trim(),
        },
      })
      .catch((error) => ({ error }))

    if ("error" in result && result.error) {
      setPending(false)
      setFlowError(toErrorMessage(result.error))
      return
    }

    await completeConnect()
  }, [apiKey, completeConnect, flow, setFlowError])

  const submitOauthCode = useCallback(async () => {
    if (!flow || flow.step !== "oauth_code" || flow.methodIndex === undefined) return
    if (!oauthCode.trim()) {
      setFlowError("Authorization code is required")
      return
    }

    setPending(true)
    const result = await client().provider.oauth
      .callback({
        path: { id: flow.providerID },
        body: {
          method: flow.methodIndex,
          code: oauthCode.trim(),
        },
      })
      .catch((error) => ({ error }))

    if ("error" in result && result.error) {
      setPending(false)
      setFlowError(toErrorMessage(result.error))
      return
    }

    await completeConnect()
  }, [completeConnect, flow, oauthCode, setFlowError])

  const backInFlow = useCallback(() => {
    if (!flow || pending) return
    if (flow.methods.length <= 1) {
      closeFlow()
      return
    }

    setFlow({
      ...flow,
      step: "method",
      error: undefined,
      authorization: undefined,
    })
  }, [closeFlow, flow, pending])

  const connectToServer = useCallback(
    async (targetUrl: string) => {
      setServerBusyAction("connect")
      setServerBusy(targetUrl)
      setServerError(null)
      try {
        const result = await connectAndBootstrap({ url: targetUrl })
        if (result.status === "error") {
          setServerError(result.error)
          return false
        }
        router.replace("/(main)/session")
        return true
      } catch (error) {
        setServerError(toErrorMessage(error))
        return false
      } finally {
        setServerBusyAction(null)
        setServerBusy(null)
      }
    },
    [router],
  )

  const handleRemoveServer = useCallback(
    async (targetUrl: string) => {
      setServerBusyAction("remove")
      setServerBusy(targetUrl)
      setServerError(null)

      try {
        const result = await removeServer(targetUrl)
        if (!result.removedActive) return
        if (result.fallbackUrl) {
          const connected = await connectToServer(result.fallbackUrl)
          if (connected) return
          disconnect()
          router.replace("/connect")
          return
        }
        disconnect()
        router.replace("/connect")
      } catch (error) {
        setServerError(toErrorMessage(error))
      } finally {
        setServerBusyAction(null)
        setServerBusy(null)
      }
    },
    [connectToServer, disconnect, removeServer, router],
  )

  const handleDisconnect = () => {
    disconnect()
    router.replace("/connect")
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Settings</Text>
        <Pressable onPress={() => router.back()} hitSlop={20}>
          <Text style={[styles.done, { color: theme.colors.accent }]}>Done</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textTertiary }]}>Server</Text>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Row label="URL" value={serverURL ?? "Not connected"} theme={theme} />
          <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
          <Row label="Status" value={status} theme={theme} />
          <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
          <Row label="Server Version" value={serverVersion ?? "Unknown"} theme={theme} />
        </View>

        <Text style={[styles.sectionTitle, { color: theme.colors.textTertiary }]}>Saved Servers</Text>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {servers.length === 0 ? (
            <View style={styles.emptyRow}>
              <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>No saved servers</Text>
            </View>
          ) : (
            servers.map((server, index) => (
              <View key={server.url}>
                {index > 0 ? <View style={[styles.separator, { backgroundColor: theme.colors.border }]} /> : null}
                <View style={styles.row}>
                  <View style={styles.providerMeta}>
                    <Text style={[styles.rowLabel, { color: theme.colors.text }]}>{serverDisplayName(server.url)}</Text>
                    <Text style={[styles.providerSub, { color: theme.colors.textTertiary }]}>
                      {server.username ? `auth: ${server.username}` : "no auth"}
                    </Text>
                  </View>
                  <View style={styles.serverActions}>
                    {activeServerUrl === server.url && status === "connected" ? (
                      <Text style={[styles.providerActionMuted, { color: theme.colors.accent }]}>Connected</Text>
                    ) : null}
                    <Pressable
                      onPress={() => void handleRemoveServer(server.url)}
                      disabled={!!serverBusy}
                    >
                      <Text style={[styles.providerAction, { color: theme.colors.error }]}>
                        {serverBusy === server.url && serverBusyAction === "remove" ? "Removing..." : "Remove"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {serverError ? <Text style={[styles.inlineError, { color: theme.colors.error }]}>{serverError}</Text> : null}

        <Pressable style={[styles.destructiveButton, { borderColor: theme.colors.border }]} onPress={handleDisconnect}>
          <Text style={[styles.destructiveText, { color: theme.colors.error }]}>Disconnect</Text>
        </Pressable>

        <Text style={[styles.sectionTitle, { color: theme.colors.textTertiary }]}>Appearance</Text>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {APPEARANCES.map((item, index) => (
            <View key={item.value}>
              {index > 0 ? <View style={[styles.separator, { backgroundColor: theme.colors.border }]} /> : null}
              <Pressable style={styles.row} onPress={() => setAppearance(item.value)}>
                <Text style={[styles.rowLabel, { color: theme.colors.text }]}>{item.label}</Text>
                {appearance === item.value ? <Text style={[styles.checkmark, { color: theme.colors.accent }]}>{"\u2713"}</Text> : null}
              </Pressable>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: theme.colors.textTertiary }]}>Connected Providers</Text>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {connectedProviders.length === 0 ? (
            <View style={styles.emptyRow}>
              <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>No connected providers</Text>
            </View>
          ) : (
            connectedProviders.map((provider, index) => (
              <View key={provider.id}>
                {index > 0 ? <View style={[styles.separator, { backgroundColor: theme.colors.border }]} /> : null}
                <View style={styles.row}>
                  <View style={styles.providerMeta}>
                    <Text style={[styles.rowLabel, { color: theme.colors.text }]}>{provider.name}</Text>
                    <Text style={[styles.providerSub, { color: theme.colors.textTertiary }]}>
                      {provider.source ? `source: ${provider.source}` : provider.id}
                    </Text>
                  </View>
                  {provider.source === "env" ? (
                    <Text style={[styles.providerActionMuted, { color: theme.colors.textTertiary }]}>env</Text>
                  ) : (
                    <Pressable onPress={() => disconnectProvider(provider.id)} disabled={providerBusy === provider.id}>
                      <Text style={[styles.providerAction, { color: theme.colors.error }]}>
                        {providerBusy === provider.id ? "Removing..." : "Remove"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: theme.colors.textTertiary }]}>Available Providers</Text>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {providerData ? (
            availableProviders.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>All providers connected</Text>
              </View>
            ) : (
              availableProviders.map((provider, index) => (
                <View key={provider.id}>
                  {index > 0 ? <View style={[styles.separator, { backgroundColor: theme.colors.border }]} /> : null}
                  <View style={styles.row}>
                    <View style={styles.providerMeta}>
                      <Text style={[styles.rowLabel, { color: theme.colors.text }]}>{provider.name}</Text>
                      <Text style={[styles.providerSub, { color: theme.colors.textTertiary }]}>{provider.id}</Text>
                    </View>
                    <Pressable onPress={() => void connectProvider(provider.id, provider.name)}>
                      <Text style={[styles.providerAction, { color: theme.colors.accent }]}>Add</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )
          ) : (
            <View style={styles.emptyRow}>
              <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>Loading providers...</Text>
            </View>
          )}
        </View>

        {providerError ? (
          <Text style={[styles.inlineError, { color: theme.colors.error }]}>{providerError}</Text>
        ) : null}

        <Text style={[styles.sectionTitle, { color: theme.colors.textTertiary }]}>About</Text>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Row label="App" value="OpenCode Mobile" theme={theme} />
          <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
          <Row label="Platform" value={`${Platform.OS} ${Platform.Version}`} theme={theme} />
        </View>
      </ScrollView>

      <Modal visible={!!flow} transparent animationType="fade" onRequestClose={closeFlow}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeFlow}>
            <View />
          </Pressable>
          <View style={styles.modalCenter}>
            <View style={[styles.modalCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <View style={styles.modalHeader}>
                <Pressable onPress={backInFlow} disabled={pending}>
                  <Text style={[styles.modalBack, { color: theme.colors.textTertiary }]}>
                    {flow && flow.methods.length > 1 ? "Back" : ""}
                  </Text>
                </Pressable>
                <Text style={[styles.modalTitle, { color: theme.colors.text }]} numberOfLines={1}>
                  {flow?.providerName ?? "Provider"}
                </Text>
                <Pressable onPress={closeFlow} disabled={pending}>
                  <Text style={[styles.modalClose, { color: theme.colors.textTertiary }]}>{"\u2715"}</Text>
                </Pressable>
              </View>

              {flow?.error ? <Text style={[styles.modalError, { color: theme.colors.error }]}>{flow.error}</Text> : null}

              {flow?.step === "method" ? (
                <View style={styles.modalBody}>
                  <Text style={[styles.modalDescription, { color: theme.colors.textSecondary }]}>Choose an authentication method.</Text>
                  {flow.methods.map((method, index) => (
                    <Pressable
                      key={`${flow.providerID}:${method.label}:${index}`}
                      style={[styles.modalAction, { borderColor: theme.colors.border }]}
                      onPress={() => void startMethod(flow, index)}
                      disabled={pending}
                    >
                      <Text style={[styles.modalActionText, { color: theme.colors.text }]}>{method.label}</Text>
                    </Pressable>
                  ))}
                  {pending ? <ActivityIndicator color={theme.colors.accent} /> : null}
                </View>
              ) : null}

              {flow?.step === "api" ? (
                <View style={styles.modalBody}>
                  <Text style={[styles.modalDescription, { color: theme.colors.textSecondary }]}>Paste your API key to connect this provider.</Text>
                  <TextInput
                    style={[
                      styles.modalInput,
                      {
                        color: theme.colors.text,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.background,
                      },
                    ]}
                    value={apiKey}
                    onChangeText={setApiKey}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="API key"
                    placeholderTextColor={theme.colors.textTertiary}
                  />
                  <Pressable
                    style={[styles.modalAction, { borderColor: theme.colors.border }]}
                    onPress={() => void submitApiKey()}
                    disabled={pending}
                  >
                    <Text style={[styles.modalActionText, { color: theme.colors.accent }]}>
                      {pending ? "Connecting..." : "Connect"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {flow?.step === "oauth_code" ? (
                <View style={styles.modalBody}>
                  <Text style={[styles.modalDescription, { color: theme.colors.textSecondary }]}>{flow.authorization?.instructions}</Text>
                  <Pressable
                    style={[styles.modalAction, { borderColor: theme.colors.border }]}
                    onPress={() => openAuthorization(flow.authorization)}
                    disabled={pending}
                  >
                    <Text style={[styles.modalActionText, { color: theme.colors.accent }]}>Open provider login</Text>
                  </Pressable>
                  <TextInput
                    style={[
                      styles.modalInput,
                      {
                        color: theme.colors.text,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.background,
                      },
                    ]}
                    value={oauthCode}
                    onChangeText={setOauthCode}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder="Authorization code"
                    placeholderTextColor={theme.colors.textTertiary}
                  />
                  <Pressable
                    style={[styles.modalAction, { borderColor: theme.colors.border }]}
                    onPress={() => void submitOauthCode()}
                    disabled={pending}
                  >
                    <Text style={[styles.modalActionText, { color: theme.colors.accent }]}>
                      {pending ? "Verifying..." : "Verify code"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {flow?.step === "oauth_auto" ? (
                <View style={styles.modalBody}>
                  <Text style={[styles.modalDescription, { color: theme.colors.textSecondary }]}>{flow.authorization?.instructions}</Text>
                  <Pressable
                    style={[styles.modalAction, { borderColor: theme.colors.border }]}
                    onPress={() => openAuthorization(flow.authorization)}
                    disabled={pending}
                  >
                    <Text style={[styles.modalActionText, { color: theme.colors.accent }]}>Open provider login</Text>
                  </Pressable>
                  <View style={styles.spinnerRow}>
                    <ActivityIndicator color={theme.colors.accent} />
                    <Text style={[styles.modalDescription, { color: theme.colors.textSecondary }]}>Waiting for authorization...</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function Row({ label, value, theme }: { label: string; value: string; theme: Theme }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: theme.colors.text }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: theme.colors.textSecondary }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  done: {
    fontSize: 16,
    fontWeight: "600",
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
  rowValue: {
    fontSize: 14,
    flex: 1,
    textAlign: "right",
    marginLeft: 16,
  },
  providerMeta: {
    flex: 1,
    gap: 2,
  },
  serverActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  providerSub: {
    fontSize: 12,
  },
  providerAction: {
    fontSize: 14,
    fontWeight: "600",
  },
  providerActionMuted: {
    fontSize: 13,
    fontWeight: "500",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  emptyRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  emptyText: {
    fontSize: 14,
  },
  serverFormCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 10,
  },
  serverInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
  },
  authFields: {
    gap: 10,
  },
  authToggleText: {
    fontSize: 13,
    fontWeight: "500",
  },
  serverPrimaryButton: {
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  serverPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
  },
  inlineError: {
    fontSize: 13,
    marginTop: 8,
    marginHorizontal: 4,
  },
  destructiveButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  destructiveText: {
    fontSize: 15,
    fontWeight: "600",
  },
  checkmark: {
    fontSize: 17,
    fontWeight: "600",
  },
  modalRoot: {
    flex: 1,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  modalCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  modalHeader: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(127,127,127,0.2)",
  },
  modalBack: {
    fontSize: 14,
    fontWeight: "500",
    minWidth: 36,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  modalClose: {
    fontSize: 13,
    fontWeight: "600",
    minWidth: 18,
    textAlign: "right",
  },
  modalBody: {
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  modalDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalAction: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  modalActionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  modalInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
  },
  spinnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalError: {
    fontSize: 13,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
})
