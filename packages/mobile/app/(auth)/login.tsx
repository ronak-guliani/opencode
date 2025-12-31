import { View, Text, TouchableOpacity, StyleSheet, TextInput, Modal } from "react-native"
import { router } from "expo-router"
import * as WebBrowser from "expo-web-browser"
import * as SecureStore from "expo-secure-store"
import Constants from "expo-constants"
import { useAuthStore } from "@/store/auth"
import { useState, useEffect } from "react"

const GITHUB_CLIENT_ID = Constants.expoConfig?.extra?.githubClientId as string | undefined

export default function Login() {
  const { isAuthenticated, setAuthenticated } = useAuthStore()
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [token, setToken] = useState("")

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/(app)")
    }
  }, [isAuthenticated])

  const handleGitHubLogin = async () => {
    if (!GITHUB_CLIENT_ID) {
      setShowTokenInput(true)
      return
    }

    try {
      WebBrowser.maybeCompleteAuthSession()

      const redirectUrl = "exp://oauth"
      const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo%20user%20read:user&redirect_uri=${encodeURIComponent(redirectUrl)}`

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl)

      if (result.type === "success") {
        const url = new URL(result.url)
        const code = url.searchParams.get("code")

        if (code) {
          await exchangeCodeForToken(code)
        }
      }
    } catch (error) {
      console.error("GitHub login error:", error)
    }
  }

  const handleTokenLogin = async () => {
    if (!token.trim()) {
      return
    }

    try {
      const response = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `token ${token}`,
        },
      })

      if (response.ok) {
        await SecureStore.setItemAsync("github_token", token)
        setShowTokenInput(false)
        setAuthenticated(true)
      }
    } catch (error) {
      console.error("Token login error:", error)
    }
  }

  const exchangeCodeForToken = async (code: string) => {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: "",
        code,
      }),
    })

    const data = await response.json()

    if (data.access_token) {
      await SecureStore.setItemAsync("github_token", data.access_token)
      setAuthenticated(true)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>OpenCode Mobile</Text>

      <TouchableOpacity style={styles.button} onPress={handleGitHubLogin}>
        <Text style={styles.buttonText}>{GITHUB_CLIENT_ID ? "Sign in with GitHub" : "Use GitHub Token"}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.linkButton} onPress={() => setShowTokenInput(true)}>
        <Text style={styles.linkText}>Or use Personal Access Token</Text>
      </TouchableOpacity>

      <Modal visible={showTokenInput} transparent animationType="slide" onRequestClose={() => setShowTokenInput(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter GitHub Personal Access Token</Text>
            <Text style={styles.modalHint}>
              Generate a token at github.com/settings/tokens with repo and user scopes
            </Text>

            <TextInput
              style={styles.tokenInput}
              value={token}
              onChangeText={setToken}
              placeholder="ghp_xxxxxxxxxxxx"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity style={styles.submitButton} onPress={handleTokenLogin}>
              <Text style={styles.submitButtonText}>Sign In</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowTokenInput(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000000",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 40,
  },
  button: {
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 24,
    minWidth: 200,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  linkButton: {
    marginTop: 16,
  },
  linkText: {
    color: "#3B82F6",
    fontSize: 14,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  modalContent: {
    backgroundColor: "#1A1A1A",
    padding: 24,
    borderRadius: 20,
    width: "90%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 12,
  },
  modalHint: {
    fontSize: 14,
    color: "#888888",
    marginBottom: 16,
    lineHeight: 20,
  },
  tokenInput: {
    backgroundColor: "#000000",
    color: "#ffffff",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#333333",
  },
  submitButton: {
    backgroundColor: "#3B82F6",
    padding: 14,
    borderRadius: 24,
    alignItems: "center",
    marginBottom: 8,
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    padding: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#888888",
    fontSize: 14,
  },
})
