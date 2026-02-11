import { useState, useCallback } from "react"
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
import { bootstrap } from "../src/api/bootstrap"
import { useTheme } from "../src/theme"

export default function ConnectScreen() {
  const theme = useTheme()
  const router = useRouter()
  const connect = useConnection((s) => s.connect)
  const status = useConnection((s) => s.status)
  const error = useConnection((s) => s.error)

  const [url, setUrl] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showAuth, setShowAuth] = useState(false)

  const [bootstrapError, setBootstrapError] = useState<string | null>(null)

  const handleConnect = useCallback(async () => {
    if (!url.trim()) return
    setBootstrapError(null)
    try {
      const auth = showAuth && username ? { username, password } : undefined
      await connect(url.trim(), auth)
      const result = await bootstrap()
      if (result.status === "error") {
        setBootstrapError(result.error ?? "Bootstrap failed")
        return
      }
      router.replace("/(main)/session")
    } catch {
      // connection error is already set in the store
    }
  }, [url, username, password, showAuth])

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
