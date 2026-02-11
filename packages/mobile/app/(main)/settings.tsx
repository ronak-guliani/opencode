import { View, Text, Pressable, StyleSheet, ScrollView, Platform } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useTheme, type Theme } from "../../src/theme"
import { useConnection } from "../../src/store/connection"
import { useSettings } from "../../src/store/settings"

const EMPTY_CONNECTED: string[] = []

const APPEARANCES = [
  { value: "system" as const, label: "System" },
  { value: "light" as const, label: "Light" },
  { value: "dark" as const, label: "Dark" },
]

export default function SettingsScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const url = useConnection((s) => s.url)
  const status = useConnection((s) => s.status)
  const serverVersion = useConnection((s) => s.serverVersion)
  const disconnect = useConnection((s) => s.disconnect)
  const config = useSettings((s) => s.config)
  const connected = useSettings((s) => s.providerData?.connected) ?? EMPTY_CONNECTED
  const providerAuth = useSettings((s) => s.providerAuth)
  const appearance = useSettings((s) => s.appearance)
  const setAppearance = useSettings((s) => s.setAppearance)

  const handleDisconnect = () => {
    disconnect()
    router.replace("/connect")
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Settings</Text>
        <Pressable onPress={() => router.back()} hitSlop={16}>
          <Text style={[styles.done, { color: theme.colors.accent }]}>Done</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* Server */}
        <Text style={[styles.sectionTitle, { color: theme.colors.textTertiary }]}>Server</Text>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Row label="URL" value={url ?? "Not connected"} theme={theme} />
          <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
          <Row label="Status" value={status} theme={theme} />
          <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
          <Row label="Server Version" value={serverVersion ?? "Unknown"} theme={theme} />
        </View>

        <Pressable style={[styles.destructiveButton, { borderColor: theme.colors.border }]} onPress={handleDisconnect}>
          <Text style={[styles.destructiveText, { color: theme.colors.error }]}>Disconnect</Text>
        </Pressable>

        {/* Appearance */}
        <Text style={[styles.sectionTitle, { color: theme.colors.textTertiary }]}>Appearance</Text>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {APPEARANCES.map((a, i) => (
            <View key={a.value}>
              {i > 0 && <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />}
              <Pressable style={styles.row} onPress={() => setAppearance(a.value)}>
                <Text style={[styles.rowLabel, { color: theme.colors.text }]}>{a.label}</Text>
                {appearance === a.value && (
                  <Text style={[styles.checkmark, { color: theme.colors.accent }]}>{"\u2713"}</Text>
                )}
              </Pressable>
            </View>
          ))}
        </View>

        {/* Providers */}
        {connected.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.colors.textTertiary }]}>Connected Providers</Text>
            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              {connected.map((id, i) => (
                <View key={id}>
                  {i > 0 && <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />}
                  <Row label={id} value={providerAuthLabel(providerAuth, id)} theme={theme} />
                </View>
              ))}
            </View>
          </>
        )}

        {/* About */}
        <Text style={[styles.sectionTitle, { color: theme.colors.textTertiary }]}>About</Text>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Row label="App" value="OpenCode Mobile" theme={theme} />
          <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
          <Row label="Platform" value={`${Platform.OS} ${Platform.Version}`} theme={theme} />
        </View>
      </ScrollView>
    </View>
  )
}

function providerAuthLabel(
  auth: Record<string, Array<{ type: string; label: string }>> | null,
  providerID: string,
): string {
  const methods = auth?.[providerID] ?? []
  if (methods.length === 0) return "connected"
  const types = Array.from(new Set(methods.map((m) => m.type)))
  return `connected (${types.join(", ")})`
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
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
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
})
