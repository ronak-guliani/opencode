import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useServerStore, saveServerConfig } from "@/store/server"
import { useState } from "react"

type AuthInput = {
  providerId: string
  apiKey: string
}

const AUTH_TIMEOUT = 10000

export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { baseUrl, setBaseUrl, directory, setDirectory } = useServerStore()
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
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView style={styles.scrollView}>
        <Text style={styles.sectionTitle}>Server Connection</Text>

        <View style={styles.section}>
          <Text style={styles.label}>OpenCode Server URL</Text>
          <TextInput
            style={styles.input}
            value={localUrl}
            onChangeText={setLocalUrl}
            placeholder="http://192.168.1.174:4096"
            placeholderTextColor="#666666"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.hint}>Get this URL from the OpenCode menu bar app</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Working Directory (optional)</Text>
          <TextInput
            style={styles.input}
            value={localDir}
            onChangeText={setLocalDir}
            placeholder="/path/to/project"
            placeholderTextColor="#666666"
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
        <Text style={styles.hint}>Configure API keys for your AI providers. Keys are stored securely on the server.</Text>

        <View style={styles.section}>
          <Text style={styles.label}>Provider ID</Text>
          <TextInput
            style={styles.input}
            value={authInputs.providerId}
            onChangeText={(text) => setAuthInputs({ ...authInputs, providerId: text })}
            placeholder="anthropic, openai, etc."
            placeholderTextColor="#666666"
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
            placeholderTextColor="#666666"
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

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1A1A1A",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
  },
  backIcon: {
    fontSize: 20,
    color: "#FFFFFF",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "IBMPlexMono-SemiBold",
    color: "#FFFFFF",
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "IBMPlexMono-Bold",
    color: "#ffffff",
    marginTop: 24,
    marginBottom: 16,
  },
  hint: {
    fontSize: 13,
    color: "#666666",
    marginTop: 6,
    fontFamily: "IBMPlexMono-Regular",
  },
  section: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    color: "#ffffff",
    marginBottom: 8,
    fontFamily: "IBMPlexMono-Medium",
  },
  input: {
    backgroundColor: "#1A1A1A",
    color: "#ffffff",
    fontSize: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#333333",
    fontFamily: "IBMPlexMono-Regular",
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
    fontFamily: "IBMPlexMono-SemiBold",
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
    fontFamily: "IBMPlexMono-Regular",
  },
  divider: {
    height: 1,
    backgroundColor: "#1A1A1A",
    marginVertical: 24,
  },
})
