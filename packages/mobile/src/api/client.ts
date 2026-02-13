import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/client"

let instance: OpencodeClient | null = null
let baseUrl: string | null = null
let baseHeaders: Record<string, string> = {}

type Auth = { username: string; password: string }

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

export function buildHeaders(directory?: string, auth?: Auth) {
  const h: Record<string, string> = {}
  if (directory) h["x-opencode-directory"] = directory
  if (auth) h["Authorization"] = `Basic ${btoa(`${auth.username}:${auth.password}`)}`
  return h
}

export function scoped(raw: string, directory?: string, auth?: Auth) {
  return createOpencodeClient({
    baseUrl: raw,
    headers: buildHeaders(directory, auth),
  })
}

export function create(raw: string, directory?: string, auth?: Auth) {
  const h = buildHeaders(directory, auth)

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
