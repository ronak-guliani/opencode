import * as SecureStore from "expo-secure-store"
import { create as createStore } from "zustand"
import * as api from "../api/client"

type Status = "disconnected" | "connecting" | "connected" | "error"
type StreamStatus = "connected" | "reconnecting" | "disconnected"

type ConnectionState = {
  url: string | null
  status: Status
  error: string | null
  directory: string | null
  auth: { username: string; password: string } | null
  stream: StreamStatus
  setStream: (s: StreamStatus) => void
  connect: (url: string, auth?: { username: string; password: string }) => Promise<void>
  disconnect: () => void
  restore: () => Promise<boolean>
}

export const useConnection = createStore<ConnectionState>((set, get) => ({
  url: null,
  status: "disconnected",
  error: null,
  directory: null,
  auth: null,
  stream: "disconnected",

  setStream: (stream) => set({ stream }),

  connect: async (url, auth) => {
    set({ status: "connecting", error: null })
    try {
      const normalized = url.replace(/\/+$/, "")
      const client = api.create(normalized, undefined, auth)

      const project = await client.project.current()
      if (!project.data) throw new Error("Failed to fetch project")

      await SecureStore.setItemAsync("server_url", normalized)
      if (auth) {
        await SecureStore.setItemAsync("server_auth", JSON.stringify(auth))
      } else {
        await SecureStore.deleteItemAsync("server_auth")
      }

      set({
        url: normalized,
        status: "connected",
        directory: project.data.worktree,
        auth,
        error: null,
      })
    } catch (e) {
      api.destroy()
      const msg = e instanceof Error ? e.message : "Connection failed"
      set({ status: "error", error: msg })
      throw e
    }
  },

  disconnect: () => {
    api.destroy()
    set({
      url: null,
      status: "disconnected",
      error: null,
      directory: null,
      auth: null,
      stream: "disconnected",
    })
    SecureStore.deleteItemAsync("server_url")
    SecureStore.deleteItemAsync("server_auth")
  },

  restore: async () => {
    const url = await SecureStore.getItemAsync("server_url")
    if (!url) return false
    const raw = await SecureStore.getItemAsync("server_auth")
    const auth = raw ? JSON.parse(raw) : undefined
    try {
      await get().connect(url, auth)
      return true
    } catch {
      return false
    }
  },
}))
