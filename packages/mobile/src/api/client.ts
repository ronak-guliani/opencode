import { useServerStore } from "@/store/server"
import { type Session, type Message } from "@/store/session"
import EventSource from "react-native-sse"

const OPENCODE_CLIENT_ID = "opencode-mobile"
const REQUEST_TIMEOUT = 10000
const SEND_MESSAGE_TIMEOUT = 120000
const SSE_RECONNECT_BASE_DELAY = 1000
const SSE_RECONNECT_MAX_DELAY = 30000
const SSE_RECONNECT_MAX_ATTEMPTS = 10

export type Provider = {
  id: string
  name: string
  env: string[]
  key?: string
  options: Record<string, any>
  models: Record<string, Model>
}

export type Model = {
  id: string
  providerID: string
  api: {
    id: string
    url: string
    npm: string
  }
  name: string
  family?: string
  capabilities: {
    temperature: boolean
    reasoning: boolean
    attachment: boolean
    toolcall: boolean
  }
  cost: {
    input: number
    output: number
  }
  limit: {
    context: number
    output: number
  }
  status: "alpha" | "beta" | "deprecated" | "active"
}

export type AuthInfo =
  | { type: "api"; key: string }
  | { type: "oauth"; refresh: string; access: string; expires: number }
  | { type: "wellknown"; key: string; token: string }

export type BusEvent = {
  type: string
  properties: Record<string, any>
}

export type MessageWithParts = {
  info: {
    id: string
    sessionID: string
    role: "user" | "assistant"
    time: { created: number; completed?: number }
    [key: string]: any
  }
  parts: Array<{
    id: string
    type: string
    text?: string
    [key: string]: any
  }>
}

function extractTextFromParts(parts: MessageWithParts["parts"]): string {
  return parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("\n")
}

function extractReasoningFromParts(parts: MessageWithParts["parts"]): string | undefined {
  const reasoning = parts
    .filter((p) => p.type === "reasoning" && p.text)
    .map((p) => p.text)
    .join("\n")
  return reasoning || undefined
}

function messageWithPartsToMessage(msg: MessageWithParts): Message {
  return {
    id: msg.info.id,
    sessionID: msg.info.sessionID,
    role: msg.info.role,
    content: extractTextFromParts(msg.parts),
    reasoning: extractReasoningFromParts(msg.parts),
    time: msg.info.time.created,
  }
}

function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = REQUEST_TIMEOUT): Promise<Response> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`Request timeout after ${timeout}ms`))
    }, timeout)

    fetch(url, { ...options, signal: controller.signal })
      .then((response) => {
        clearTimeout(timer)
        resolve(response)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

export class OpenCodeClient {
  private baseUrl: string
  private directory: string

  constructor(baseUrl?: string, directory?: string) {
    this.baseUrl = baseUrl || useServerStore.getState().baseUrl
    this.directory = directory || useServerStore.getState().directory
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const response = await fetchWithTimeout(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Request failed: ${response.status} - ${text}`)
    }

    return response.json()
  }

  async listSessions() {
    return this.request<Session[]>("/session")
  }

  async createSession() {
    return this.request<Session>("/session", {
      method: "POST",
      body: JSON.stringify({}),
    })
  }

  async getSession(id: string) {
    return this.request<Session>(`/session/${encodeURIComponent(id)}`)
  }

  async getMessages(sessionId: string, limit?: number): Promise<Message[]> {
    const params = new URLSearchParams()
    if (limit) params.append("limit", limit.toString())
    const raw = await this.request<MessageWithParts[]>(
      `/session/${encodeURIComponent(sessionId)}/message?${params.toString()}`,
    )
    return raw.map(messageWithPartsToMessage)
  }

  async sendMessage(sessionId: string, input: string, model: { providerID: string; modelID: string }) {
    const response = await fetchWithTimeout(
      `${this.baseUrl}/session/${encodeURIComponent(sessionId)}/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parts: [{ type: "text", text: input }], model }),
      },
      SEND_MESSAGE_TIMEOUT,
    )

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Send message failed: ${response.status} - ${text}`)
    }

    return response.json()
  }

  async listProviders() {
    return this.request<{
      all: Provider[]
      connected: string[]
      default: Record<string, string>
    }>("/provider")
  }

  async setProviderAuth(providerId: string, auth: AuthInfo) {
    await this.request<boolean>(`/auth/${encodeURIComponent(providerId)}`, {
      method: "PUT",
      body: JSON.stringify(auth),
    })
  }

  subscribeToEvents(
    callback: (event: BusEvent) => void,
    onConnectionChange?: (connected: boolean) => void,
  ): () => void {
    const params = new URLSearchParams()
    if (this.directory) params.append("directory", this.directory)
    const url = `${this.baseUrl}/event?${params.toString()}`

    let es: EventSource<"message"> | null = null
    let reconnectAttempts = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let stopped = false

    const connect = () => {
      if (stopped) return

      es = new EventSource<"message">(url, {
        headers: { "Client-ID": OPENCODE_CLIENT_ID },
      })

      es.addEventListener("open", () => {
        reconnectAttempts = 0
        onConnectionChange?.(true)
      })

      es.addEventListener("message", (e: { data: string | null }) => {
        if (e.data) {
          try {
            const event = JSON.parse(e.data)
            callback(event)
          } catch (error) {
            console.error("Failed to parse event:", error)
          }
        }
      })

      es.addEventListener("error", () => {
        onConnectionChange?.(false)
        es?.close()
        es = null

        if (stopped || reconnectAttempts >= SSE_RECONNECT_MAX_ATTEMPTS) {
          callback({ type: "connection.failed", properties: { attempts: reconnectAttempts } })
          return
        }

        const delay = Math.min(SSE_RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts), SSE_RECONNECT_MAX_DELAY)
        reconnectAttempts++
        reconnectTimer = setTimeout(connect, delay)
      })
    }

    connect()

    return () => {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (es) {
        es.close()
        es = null
      }
    }
  }

  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/global/health`, {}, 5000)
      if (!response.ok) {
        return { connected: false, error: `Server returned ${response.status}` }
      }
      const data = await response.json()
      return { connected: data.healthy === true }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return { connected: false, error: message }
    }
  }
}

export function subscribeToEvents(
  callback: (event: BusEvent) => void,
  onConnectionChange?: (connected: boolean) => void,
) {
  const client = new OpenCodeClient()
  return client.subscribeToEvents(callback, onConnectionChange)
}
