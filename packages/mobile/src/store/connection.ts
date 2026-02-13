import * as SecureStore from "expo-secure-store"
import { create as createStore } from "zustand"
import type { Project } from "@opencode-ai/sdk/client"
import * as api from "../api/client"

type Status = "disconnected" | "connecting" | "connected" | "error"
type StreamStatus = "connected" | "reconnecting" | "disconnected"

type Auth = { username: string; password: string }

function normalize(input: string) {
  const value = input.trim()
  if (!value) return value
  if (value === "/") return value
  if (/^[A-Za-z]:[\\/]?$/.test(value)) return value
  return value.replace(/[\\/]+$/, "")
}

type ConnectionState = {
  url: string | null
  status: Status
  error: string | null
  directory: string | null
  auth: Auth | null
  projects: Project[]
  stream: StreamStatus
  setStream: (s: StreamStatus) => void
  connect: (url: string, auth?: Auth) => Promise<void>
  refreshProjects: () => Promise<void>
  switchProject: (directory: string) => Promise<void>
  disconnect: () => void
  restore: () => Promise<boolean>
}

export const useConnection = createStore<ConnectionState>((set, get) => ({
  url: null,
  status: "disconnected",
  error: null,
  directory: null,
  auth: null,
  projects: [],
  stream: "disconnected",

  setStream: (stream) => set({ stream }),

  connect: async (url, auth) => {
    set({ status: "connecting", error: null })
    try {
      const normalized = url.replace(/\/+$/, "")
      const client = api.create(normalized, undefined, auth)

      const [project, projects] = await Promise.all([client.project.current(), client.project.list()])
      if (!project.data) throw new Error("Failed to fetch current project")

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
        projects: projects.data ?? [],
        error: null,
      })
    } catch (e) {
      api.destroy()
      const msg = e instanceof Error ? e.message : "Connection failed"
      set({ status: "error", error: msg })
      throw e
    }
  },

  refreshProjects: async () => {
    const status = get().status
    if (status !== "connected") return
    const result = await api.client().project.list()
    set({ projects: result.data ?? [] })
  },

  switchProject: async (directory) => {
    const state = get()
    if (!state.url) throw new Error("Not connected")
    const next = normalize(directory)
    if (!next) throw new Error("Folder path is required")
    if (state.directory === next) return

    const previous = state.directory ?? undefined
    try {
      const client = api.create(state.url, next, state.auth ?? undefined)
      const project = await client.project.current()
      if (!project.data) throw new Error("Failed to switch project")
      set({ directory: project.data.worktree, error: null })
      await get().refreshProjects()
    } catch (e) {
      api.create(state.url, previous, state.auth ?? undefined)
      const msg = e instanceof Error ? e.message : "Failed to switch project"
      set({ error: msg })
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
      projects: [],
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
