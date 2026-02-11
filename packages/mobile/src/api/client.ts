import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/client"

let instance: OpencodeClient | null = null
let baseUrl: string | null = null
let baseHeaders: Record<string, string> = {}

export function client(): OpencodeClient {
  if (!instance) throw new Error("SDK client not initialized. Call create() first.")
  return instance
}

export function url(): string {
  if (!baseUrl) throw new Error("SDK client not initialized. Call create() first.")
  return baseUrl
}

export function headers(): Record<string, string> {
  return baseHeaders
}

export function create(raw: string, directory?: string, auth?: { username: string; password: string }) {
  const h: Record<string, string> = {}
  if (directory) h["x-opencode-directory"] = directory
  if (auth) h["Authorization"] = `Basic ${btoa(`${auth.username}:${auth.password}`)}`

  baseUrl = raw
  baseHeaders = h

  instance = createOpencodeClient({
    baseUrl: raw,
    headers: h,
  })
  return instance
}

export function destroy() {
  instance = null
  baseUrl = null
  baseHeaders = {}
}
