import { useState, useCallback, useEffect } from "react"
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native"
import { useRouter } from "expo-router"
import { useConnection } from "../src/store/connection"
import { connectAndBootstrap } from "../src/features/connection/connect-and-bootstrap"
import { useTheme } from "../src/theme"

export default function ConnectScreen() {
  const theme = useTheme()
  const router = useRouter()
  const servers = useConnection((s) => s.servers)
  const status = useConnection((s) => s.status)
  const error = useConnection((s) => s.error)

  const [url, setUrl] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showAuth, setShowAuth] = useState(false)

  const [bootstrapError, setBootstrapError] = useState<string | null>(null)

  useEffect(() => {
    const first = servers[0]
    if (!first) return
    setUrl((current) => current || first.url)
  }, [servers])

  const handleConnect = useCallback(async () => {
    if (!url.trim()) return
    setBootstrapError(null)
    const auth = showAuth && username.trim() && password.length > 0 ? { username: username.trim(), password } : undefined
    const result = await connectAndBootstrap({
      url: url.trim(),
      auth,
    })
    if (result.status === "error") {
      if (result.stage === "bootstrap") {
        setBootstrapError(result.error)
      }
      // Note: connect-stage errors are already set in the store via useConnection.connect()
      // The store's error state is rendered via the `error` selector above
      return
    }
    router.replace("/(main)/session")
  }, [password, router, showAuth, url, username])

  const connecting = status === "connecting"

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>OpenCode</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            Connect to a running opencode server
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Server URL</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.surface,
                color: theme.colors.text,
                borderColor: theme.colors.border,
              },
            ]}
            value={url}
            onChangeText={setUrl}
            placeholder="https://your-server.ngrok.io"
            placeholderTextColor={theme.colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={handleConnect}
            editable={!connecting}
          />

          <Pressable onPress={() => setShowAuth((v) => !v)} style={styles.authToggle}>
            <Text style={[styles.authToggleText, { color: theme.colors.accent }]}>
              {showAuth ? "Hide authentication" : "Add authentication"}
            </Text>
          </Pressable>

          {showAuth && (
            <View style={styles.authFields}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.surface,
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                  },
                ]}
                value={username}
                onChangeText={setUsername}
                placeholder="Username"
                placeholderTextColor={theme.colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!connecting}
              />
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.surface,
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                  },
                ]}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={theme.colors.textTertiary}
                secureTextEntry
                autoCapitalize="none"
                editable={!connecting}
              />
            </View>
          )}

          {servers.length > 0 && (
            <View style={styles.recentSection}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Saved Servers</Text>
              <View style={[styles.recentList, { borderColor: theme.colors.border }]}>
                {servers.map((server, index) => (
                  <View key={server.url}>
                    {index > 0 && <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />}
                    <Pressable
                      style={styles.recentItem}
                      onPress={() => {
                        setUrl(server.url)
                        setUsername(server.username ?? "")
                        setPassword("")
                        setShowAuth(!!server.username)
                      }}
                    >
                      <Text style={[styles.recentUrl, { color: theme.colors.text }]} numberOfLines={1}>
                        {server.url}
                      </Text>
                      {server.username ? (
                        <Text style={[styles.recentMeta, { color: theme.colors.textTertiary }]}>
                          auth: {server.username}
                        </Text>
                      ) : (
                        <Text style={[styles.recentMeta, { color: theme.colors.textTertiary }]}>no auth</Text>
                      )}
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )}

          {(error || bootstrapError) && (
            <View style={[styles.errorBox, { backgroundColor: theme.colors.error + "15" }]}>
              <Text style={[styles.errorText, { color: theme.colors.error }]}>{error || bootstrapError}</Text>
            </View>
          )}

          <Pressable
            style={[
              styles.button,
              { backgroundColor: theme.colors.accent, opacity: connecting || !url.trim() ? 0.6 : 1 },
            ]}
            onPress={handleConnect}
            disabled={connecting || !url.trim()}
          >
            {connecting ? (
              <ActivityIndicator color={theme.colors.accentText} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.colors.accentText }]}>Connect</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 48,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 8,
  },
  form: {
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
  },
  authToggle: {
    paddingVertical: 4,
  },
  authToggleText: {
    fontSize: 13,
    fontWeight: "500",
  },
  authFields: {
    gap: 12,
  },
  recentSection: {
    gap: 6,
  },
  recentList: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: "hidden",
  },
  recentItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  recentUrl: {
    fontSize: 13,
    fontWeight: "500",
  },
  recentMeta: {
    fontSize: 11,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  errorBox: {
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    fontSize: 13,
  },
  button: {
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
  },
})
