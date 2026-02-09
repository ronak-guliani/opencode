import { useState, useRef } from "react"
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native"
import { router } from "expo-router"
import { StyleSheet } from "react-native-unistyles"
import { useConnectionStore } from "@/store/connection"
import { createClient } from "@/api/client"

/**
 * Connect screen — first screen users see. Enter server URL, optional auth,
 * tap connect to health-check and navigate to main app.
 */
export default function ConnectScreen() {
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const input = useRef<TextInput>(null)

  async function connect() {
    const trimmed = url.trim().replace(/\/+$/, "")
    if (!trimmed) {
      setError("Enter a server URL")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const normalized = trimmed.startsWith("http") ? trimmed : `http://${trimmed}`
      const client = createClient(normalized)

      const health = await client.global.health()
      if (!health.data?.healthy) {
        setError("Server is not healthy")
        setLoading(false)
        return
      }

      const connection = useConnectionStore.getState()
      connection.setCredentials(normalized, null)
      connection.setStatus("connected")

      router.replace("/(main)/session")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>opencode</Text>
        <Text style={styles.subtitle}>Connect to your server</Text>

        <View style={styles.form}>
          <TextInput
            ref={input}
            style={styles.input}
            placeholder="http://localhost:3000"
            placeholderTextColor="#71717a"
            value={url}
            onChangeText={(text) => {
              setUrl(text)
              setError(null)
            }}
            onSubmitEditing={connect}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            editable={!loading}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, loading && styles.buttonDisabled]}
            onPress={connect}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Connect</Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  title: {
    fontSize: theme.typography.size.xxxl,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xxxl,
  },
  form: {
    gap: theme.spacing.lg,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    fontSize: theme.typography.size.md,
    color: theme.colors.text,
  },
  error: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.error,
    textAlign: "center",
  },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.semibold,
    color: theme.colors.accentText,
  },
}))
