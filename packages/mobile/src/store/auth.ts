import { create } from "zustand"
import * as SecureStore from "expo-secure-store"

type AuthState = {
  isAuthenticated: boolean
  isLoading: boolean
  githubToken: string | null
  setAuthenticated: (value: boolean) => void
  setLoading: (value: boolean) => void
  setGithubToken: (token: string) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: false,
  githubToken: null,
  setAuthenticated: (value) => set({ isAuthenticated: value }),
  setLoading: (value) => set({ isLoading: value }),
  setGithubToken: (token) => set({ githubToken: token }),
}))

export const initializeAuth = async () => {
  try {
    const token = await SecureStore.getItemAsync("github_token")
    if (token) {
      useAuthStore.getState().setGithubToken(token)
      useAuthStore.getState().setAuthenticated(true)
    }
  } catch (error) {
    console.error("Failed to load auth:", error)
  }
}
