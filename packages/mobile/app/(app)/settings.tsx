import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useServerStore, saveServerConfig } from "@/store/server"
import { useAuthStore } from "@/store/auth"
import * as SecureStore from "expo-secure-store"
import { useState } from "react"

type AuthInput = {
  providerId: string
  apiKey: string
}

const AUTH_TIMEOUT = 10000

export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const { baseUrl, setBaseUrl, directory, setDirectory } = useServerStore()
  const { setAuthenticated } = useAuthStore()
  const [localUrl, setLocalUrl] = useState(baseUrl)
  const [localDir, setLocalDir] = useState(directory)
  const [authInputs, setAuthInputs] = useState<AuthInput>({ providerId: "", apiKey: "" })

  const [isSaved, setIsSaved] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleSaveServer = async () => {
    await saveServerConfig(localUrl, localDir)
    setBaseUrl(localUrl)
    setDirectory(localDir)
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync("github_token")
    setAuthenticated(false)
  }

  const handleSaveProviderAuth = async () => {
    if (!authInputs.providerId || !authInputs.apiKey) {
      return
    }

    setIsSaving(true)
    setAuthError(null)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT)

    try {
      const response = await fetch(`${baseUrl}/auth/${authInputs.providerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "api", key: authInputs.apiKey }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!response.ok) {
        setAuthError(`Failed to save: ${response.status} ${response.statusText}`)
        setIsSaving(false)
        return
      }

      setAuthInputs({ providerId: "", apiKey: "" })
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2000)
    } catch (error) {
      clearTimeout(timeout)
      if (error instanceof Error && error.name === "AbortError") {
        setAuthError("Request timed out. Check server connection.")
      } else {
        setAuthError(error instanceof Error ? error.message : "Failed to save API key")
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView style={styles.scrollView}>
        <Text style={styles.sectionTitle}>Server Connection</Text>

        <View style={styles.section}>
          <Text style={styles.label}>OpenCode Server URL</Text>
          <TextInput
            style={styles.input}
            value={localUrl}
            onChangeText={setLocalUrl}
            placeholder="http://localhost:4096"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Working Directory (optional)</Text>
          <TextInput
            style={styles.input}
            value={localDir}
            onChangeText={setLocalDir}
            placeholder="/path/to/project"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, isSaved ? styles.buttonSaved : null]}
          onPress={handleSaveServer}
          disabled={isSaved}
        >
          <Text style={styles.buttonText}>{isSaved ? "Saved!" : "Save Server Config"}</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Provider Authentication</Text>
        <Text style={styles.hint}>Configure API keys for your AI providers. Keys are stored securely on device.</Text>

        <View style={styles.section}>
          <Text style={styles.label}>Provider ID (e.g., anthropic, openai)</Text>
          <TextInput
            style={styles.input}
            value={authInputs.providerId}
            onChangeText={(text) => setAuthInputs({ ...authInputs, providerId: text })}
            placeholder="anthropic"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>API Key</Text>
          <TextInput
            style={styles.input}
            value={authInputs.apiKey}
            onChangeText={(text) => setAuthInputs({ ...authInputs, apiKey: text })}
            placeholder="sk-ant-..."
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
        </View>

        {authError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{authError}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, isSaved ? styles.buttonSaved : null, isSaving && styles.buttonDisabled]}
          onPress={handleSaveProviderAuth}
          disabled={isSaved || isSaving || !authInputs.providerId || !authInputs.apiKey}
        >
          <Text style={styles.buttonText}>{isSaving ? "Saving..." : isSaved ? "Saved!" : "Save API Key"}</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>GitHub Account</Text>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#ffffff",
    marginTop: 24,
    marginBottom: 16,
  },
  hint: {
    fontSize: 14,
    color: "#888888",
    marginBottom: 16,
  },
  section: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    color: "#ffffff",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1A1A1A",
    color: "#ffffff",
    fontSize: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#333333",
  },
  button: {
    backgroundColor: "#3B82F6",
    padding: 16,
    borderRadius: 24,
    alignItems: "center",
    marginTop: 8,
  },
  buttonSaved: {
    backgroundColor: "#10b981",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  errorContainer: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: "#1A1A1A",
    marginVertical: 24,
  },
  logoutButton: {
    backgroundColor: "#1A1A1A",
    padding: 16,
    borderRadius: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  logoutButtonText: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "600",
  },
})
