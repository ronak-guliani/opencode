import * as SecureStore from "expo-secure-store"
import { create as createStore } from "zustand"
import * as api from "../api/client"
import { unsubscribe } from "../api/events"

type Status = "disconnected" | "connecting" | "connected" | "error"
type StreamStatus = "connected" | "reconnecting" | "disconnected"

type ConnectionState = {
  url: string | null
  status: Status
  error: string | null
  directory: string | null
  serverVersion: string | null
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
  serverVersion: null,
  auth: null,
  stream: "disconnected",

  setStream: (stream) => set({ stream }),

  connect: async (url, auth) => {
    set({ status: "connecting", error: null, stream: "disconnected" })
    unsubscribe()
    api.destroy()
    try {
      const normalized = url.replace(/\/+$/, "")
      const authHeader = auth ? `Basic ${btoa(`${auth.username}:${auth.password}`)}` : undefined

      // Validate server and capture version before initializing project-scoped client.
      const health = await fetch(`${normalized}/global/health`, {
        headers: authHeader ? { Authorization: authHeader } : undefined,
      })
      if (!health.ok) throw new Error(`Health check failed (${health.status})`)
      const healthData = (await health.json()) as { healthy?: boolean; version?: string }
      if (!healthData?.healthy) throw new Error("Server is not healthy")

      const sdk = api.create(normalized, undefined, auth)

      const project = await sdk.project.current()
      if (!project.data) throw new Error("Failed to fetch project")
      const directory = project.data.worktree

      // Recreate client with resolved directory so all requests/SSE target the same project instance.
      api.create(normalized, directory, auth)

      await SecureStore.setItemAsync("server_url", normalized)
      if (auth) {
        await SecureStore.setItemAsync("server_auth", JSON.stringify(auth))
      } else {
        await SecureStore.deleteItemAsync("server_auth")
      }

      set({
        url: normalized,
        status: "connected",
        directory,
        serverVersion: healthData.version ?? null,
        auth,
        error: null,
        stream: "disconnected",
      })
    } catch (e) {
      unsubscribe()
      api.destroy()
      const msg = e instanceof Error ? e.message : "Connection failed"
      set({ status: "error", error: msg })
      throw e
    }
  },

  disconnect: () => {
    unsubscribe()
    api.destroy()
    set({
      url: null,
      status: "disconnected",
      error: null,
      directory: null,
      serverVersion: null,
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
    let auth: { username: string; password: string } | undefined
    if (raw) {
      try {
        auth = JSON.parse(raw)
      } catch {
        auth = undefined
      }
    }
    try {
      await get().connect(url, auth)
      return true
    } catch {
      return false
    }
  },
}))
