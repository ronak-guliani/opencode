import AsyncStorage from "@react-native-async-storage/async-storage"
import * as SecureStore from "expo-secure-store"
import { create as createStore } from "zustand"
import { createOpencodeClient } from "@opencode-ai/sdk/client"
import * as api from "../api/client"
import { subscribe, unsubscribe } from "../api/events"
import { useMessages } from "./messages"
import { useRequests } from "./requests"
import { useSessions } from "./sessions"
import { useSettings } from "./settings"
import { normalizeServerUrl } from "../util/server"

type Status = "disconnected" | "connecting" | "connected" | "error"
type StreamStatus = "connected" | "reconnecting" | "disconnected"

type ServerAuth = { username: string; password: string }

export type SavedServer = {
  url: string
  username?: string
  createdAt: number
  lastUsedAt: number
}

type RemoveServerResult = {
  removedActive: boolean
  fallbackUrl: string | null
}

type ConnectionState = {
  servers: SavedServer[]
  activeServerUrl: string | null
  url: string | null
  status: Status
  error: string | null
  directory: string | null
  serverVersion: string | null
  auth: ServerAuth | null
  stream: StreamStatus
  setStream: (s: StreamStatus) => void
  switchDirectory: (directory: string) => Promise<void>
  saveServer: (url: string, auth?: ServerAuth) => Promise<void>
  removeServer: (url: string) => Promise<RemoveServerResult>
  connect: (url: string, auth?: ServerAuth) => Promise<void>
  disconnect: () => void
  restore: () => Promise<boolean>
}

const SERVERS_KEY = "opencode_mobile_servers_v1"
const ACTIVE_SERVER_KEY = "opencode_mobile_active_server_v1"
const SERVER_AUTH_KEY_PREFIX = "opencode_mobile_server_auth_v1_"

const LEGACY_SERVER_URL_KEY = "server_url"
const LEGACY_SERVER_AUTH_KEY = "server_auth"
const LEGACY_RECENT_SERVERS_KEY = "recent_servers_v1"

function serverAuthKey(url: string) {
  return `${SERVER_AUTH_KEY_PREFIX}${btoa(encodeURIComponent(url)).replace(/\+/g, "-").replace(/\//g, ".").replace(/=/g, "_")}`
}

function parseAuth(raw: string | null) {
  if (!raw) return
  try {
    const parsed = JSON.parse(raw) as { username?: unknown; password?: unknown }
    if (typeof parsed.username !== "string" || typeof parsed.password !== "string") return
    if (!parsed.username.trim()) return
    return { username: parsed.username, password: parsed.password }
  } catch {
    return
  }
}

function sortServers(list: SavedServer[]) {
  return [...list].sort((a, b) => {
    if (a.lastUsedAt === b.lastUsedAt) return a.url.localeCompare(b.url)
    return b.lastUsedAt - a.lastUsedAt
  })
}

function normalizeServerList(input: SavedServer[]) {
  const map = new Map<string, SavedServer>()

  for (const item of input) {
    const url = normalizeServerUrl(item.url)
    if (!url) continue

    const createdAt = Number.isFinite(item.createdAt) ? item.createdAt : Date.now()
    const lastUsedAt = Number.isFinite(item.lastUsedAt) ? item.lastUsedAt : createdAt
    const username = item.username?.trim() || undefined

    const previous = map.get(url)
    if (!previous) {
      map.set(url, { url, username, createdAt, lastUsedAt })
      continue
    }

    map.set(url, {
      url,
      username: username ?? previous.username,
      createdAt: Math.min(previous.createdAt, createdAt),
      lastUsedAt: Math.max(previous.lastUsedAt, lastUsedAt),
    })
  }

  return sortServers([...map.values()])
}

function upsertServer(
  list: SavedServer[],
  url: string,
  options?: {
    username?: string
    touch?: boolean
  },
) {
  const now = Date.now()
  const username = options?.username?.trim() || undefined
  const existing = list.find((server) => server.url === url)

  if (!existing) {
    return sortServers([
      ...list,
      {
        url,
        username,
        createdAt: now,
        lastUsedAt: now,
      },
    ])
  }

  return sortServers(
    list.map((server) => {
      if (server.url !== url) return server
      return {
        ...server,
        username: username ?? server.username,
        lastUsedAt: options?.touch ? now : server.lastUsedAt,
      }
    }),
  )
}

async function readServers() {
  const raw = await AsyncStorage.getItem(SERVERS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as SavedServer[]
    if (!Array.isArray(parsed)) return []
    return normalizeServerList(parsed)
  } catch {
    return []
  }
}

async function writeServers(servers: SavedServer[]) {
  await AsyncStorage.setItem(SERVERS_KEY, JSON.stringify(servers))
}

async function readActiveServerUrl() {
  const raw = await SecureStore.getItemAsync(ACTIVE_SERVER_KEY)
  const normalized = raw ? normalizeServerUrl(raw) : undefined
  return normalized ?? null
}

async function writeActiveServerUrl(url: string | null) {
  if (!url) {
    await SecureStore.deleteItemAsync(ACTIVE_SERVER_KEY)
    return
  }
  await SecureStore.setItemAsync(ACTIVE_SERVER_KEY, url)
}

async function readServerAuth(url: string) {
  const raw = await SecureStore.getItemAsync(serverAuthKey(url))
  return parseAuth(raw)
}

async function writeServerAuth(url: string, auth?: ServerAuth) {
  if (!auth?.username.trim()) return
  await SecureStore.setItemAsync(serverAuthKey(url), JSON.stringify(auth))
}

function resetServerScopedState() {
  useSessions.getState().reset()
  useMessages.getState().reset()
  useRequests.getState().reset()
  useSettings.getState().resetRemote()
}

async function migrateLegacyServerState() {
  const existing = await AsyncStorage.getItem(SERVERS_KEY)
  if (existing !== null) return

  const [legacyUrlRaw, legacyAuthRaw, recentRaw] = await Promise.all([
    SecureStore.getItemAsync(LEGACY_SERVER_URL_KEY),
    SecureStore.getItemAsync(LEGACY_SERVER_AUTH_KEY),
    AsyncStorage.getItem(LEGACY_RECENT_SERVERS_KEY),
  ])

  const legacyUrl = legacyUrlRaw ? normalizeServerUrl(legacyUrlRaw) : undefined
  const legacyAuth = parseAuth(legacyAuthRaw)

  const recent = (() => {
    if (!recentRaw) return [] as Array<{ url?: string; username?: string }>
    try {
      const parsed = JSON.parse(recentRaw) as Array<{ url?: string; username?: string }>
      if (!Array.isArray(parsed)) return []
      return parsed
    } catch {
      return []
    }
  })()

  const ordered = [legacyUrl, ...recent.map((item) => item.url)].filter((item): item is string => !!item)
  const seen = new Set<string>()
  const now = Date.now()
  const servers = normalizeServerList(
    ordered.flatMap((value, index) => {
      const url = normalizeServerUrl(value)
      if (!url || seen.has(url)) return []
      seen.add(url)

      const recentMatch = recent.find((item) => normalizeServerUrl(item.url || "") === url)
      const username = url === legacyUrl ? legacyAuth?.username : recentMatch?.username
      return [
        {
          url,
          username,
          createdAt: now - index,
          lastUsedAt: now - index,
        } satisfies SavedServer,
      ]
    }),
  )

  await writeServers(servers)

  if (legacyUrl) {
    await writeActiveServerUrl(legacyUrl)
  }

  if (legacyUrl && legacyAuth) {
    await writeServerAuth(legacyUrl, legacyAuth)
  }

  await Promise.all([
    SecureStore.deleteItemAsync(LEGACY_SERVER_URL_KEY),
    SecureStore.deleteItemAsync(LEGACY_SERVER_AUTH_KEY),
    AsyncStorage.removeItem(LEGACY_RECENT_SERVERS_KEY),
  ])
}

export const useConnection = createStore<ConnectionState>((set, get) => ({
  servers: [],
  activeServerUrl: null,
  url: null,
  status: "disconnected",
  error: null,
  directory: null,
  serverVersion: null,
  auth: null,
  stream: "disconnected",

  setStream: (stream) => set({ stream }),

  switchDirectory: async (directory) => {
    const state = get()
    if (!state.url || state.status !== "connected") return
    if (state.directory === directory) return

    unsubscribe()
    api.create(state.url, directory, state.auth ?? undefined)
    set({ directory, stream: "disconnected" })
    void subscribe()
  },

  saveServer: async (rawUrl, auth) => {
    const normalized = normalizeServerUrl(rawUrl)
    if (!normalized) throw new Error("Invalid server URL")

    const next = upsertServer(get().servers, normalized, {
      username: auth?.username,
      touch: false,
    })

    set({ servers: next })

    await writeServers(next)

    if (!auth) return
    await writeServerAuth(normalized, auth)
  },

  removeServer: async (rawUrl) => {
    const normalized = normalizeServerUrl(rawUrl)
    if (!normalized) return { removedActive: false, fallbackUrl: null }

    const state = get()
    const removedActive = state.activeServerUrl === normalized
    const next = state.servers.filter((server) => server.url !== normalized)

    set({
      servers: next,
      activeServerUrl: removedActive ? null : state.activeServerUrl,
    })

    await writeServers(next)
    await SecureStore.deleteItemAsync(serverAuthKey(normalized))

    if (removedActive) {
      await writeActiveServerUrl(null)
    }

    return {
      removedActive,
      fallbackUrl: next[0]?.url ?? null,
    }
  },

  connect: async (rawUrl, auth) => {
    const previous = get()
    const hadActive = !!previous.url && previous.status === "connected"

    set({ status: "connecting", error: null })

    try {
      const normalized = normalizeServerUrl(rawUrl)
      if (!normalized) throw new Error("Invalid server URL")

      const savedAuth = await readServerAuth(normalized)
      const resolvedAuth = auth?.username ? auth : savedAuth
      const authHeader = resolvedAuth ? `Basic ${btoa(`${resolvedAuth.username}:${resolvedAuth.password}`)}` : undefined

      const health = await fetch(`${normalized}/global/health`, {
        headers: authHeader ? { Authorization: authHeader } : undefined,
      })
      if (!health.ok) throw new Error(`Health check failed (${health.status})`)

      const healthData = (await health.json()) as { healthy?: boolean; version?: string }
      if (!healthData?.healthy) throw new Error("Server is not healthy")

      const headers = resolvedAuth ? { Authorization: authHeader! } : undefined
      const temp = createOpencodeClient({
        baseUrl: normalized,
        headers,
      })

      const project = await temp.project.current()
      if (!project.data) throw new Error("Failed to fetch project")
      const directory = project.data.worktree

      const servers = upsertServer(previous.servers, normalized, {
        username: resolvedAuth?.username,
        touch: true,
      })

      unsubscribe()
      api.create(normalized, directory, resolvedAuth)

      resetServerScopedState()

      await writeServers(servers)
      await writeActiveServerUrl(normalized)
      await writeServerAuth(normalized, resolvedAuth)

      set({
        servers,
        activeServerUrl: normalized,
        url: normalized,
        status: "connected",
        directory,
        serverVersion: healthData.version ?? null,
        auth: resolvedAuth ?? null,
        error: null,
        stream: "disconnected",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection failed"

      if (hadActive) {
        set({
          servers: previous.servers,
          activeServerUrl: previous.activeServerUrl ?? previous.url,
          url: previous.url,
          status: previous.status,
          error: message,
          directory: previous.directory,
          serverVersion: previous.serverVersion,
          auth: previous.auth,
          stream: previous.stream,
        })
        throw error
      }

      unsubscribe()
      api.destroy()
      set({
        status: "error",
        error: message,
        url: null,
        directory: null,
        serverVersion: null,
        auth: null,
        stream: "disconnected",
      })
      throw error
    }
  },

  disconnect: () => {
    const servers = get().servers

    unsubscribe()
    api.destroy()
    resetServerScopedState()

    set({
      servers,
      activeServerUrl: null,
      url: null,
      status: "disconnected",
      error: null,
      directory: null,
      serverVersion: null,
      auth: null,
      stream: "disconnected",
    })

    void writeActiveServerUrl(null)
  },

  restore: async () => {
    await migrateLegacyServerState()

    const [servers, activeServer] = await Promise.all([readServers(), readActiveServerUrl()])
    const fallback = activeServer && servers.some((server) => server.url === activeServer) ? activeServer : servers[0]?.url ?? null

    set({
      servers,
      activeServerUrl: fallback,
    })

    if (!fallback) return false

    try {
      await get().connect(fallback)
      return true
    } catch {
      return false
    }
  },
}))
