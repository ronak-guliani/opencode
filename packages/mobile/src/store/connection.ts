import { create } from "zustand"
import * as SecureStore from "expo-secure-store"

const URL_KEY = "opencode_server_url"
const AUTH_KEY = "opencode_server_auth"

type Auth = { username: string; password: string }

interface ConnectionState {
  url: string | null
  auth: Auth | null
  status: "disconnected" | "connecting" | "connected" | "error"
  error: string | null
  directory: string | null
}

interface ConnectionActions {
  setStatus: (status: ConnectionState["status"], error?: string) => void
  setDirectory: (directory: string) => void
  setCredentials: (url: string, auth: Auth | null) => void
  disconnect: () => void
  hydrate: () => Promise<void>
}

type ConnectionStore = ConnectionState & ConnectionActions

/**
 * Connection store manages server URL, auth credentials, and connection status.
 *
 * Credentials are persisted in expo-secure-store (encrypted on device).
 * Status transitions: disconnected -> connecting -> connected | error.
 * Hydrate is called on app launch to restore persisted URL/auth.
 */
export const useConnectionStore = create<ConnectionStore>((set) => ({
  url: null,
  auth: null,
  status: "disconnected",
  error: null,
  directory: null,

  setStatus: (status, error) => set({ status, error: error ?? null }),

  setDirectory: (directory) => set({ directory }),

  setCredentials: (url, auth) => {
    SecureStore.setItemAsync(URL_KEY, url)
    if (auth) {
      SecureStore.setItemAsync(AUTH_KEY, JSON.stringify(auth))
    } else {
      SecureStore.deleteItemAsync(AUTH_KEY)
    }
    set({ url, auth })
  },

  disconnect: () => {
    SecureStore.deleteItemAsync(URL_KEY)
    SecureStore.deleteItemAsync(AUTH_KEY)
    set({
      url: null,
      auth: null,
      status: "disconnected",
      error: null,
      directory: null,
    })
  },

  hydrate: async () => {
    const url = await SecureStore.getItemAsync(URL_KEY)
    if (!url) return

    const raw = await SecureStore.getItemAsync(AUTH_KEY)
    const auth = raw ? (JSON.parse(raw) as Auth) : null
    set({ url, auth })
  },
}))
