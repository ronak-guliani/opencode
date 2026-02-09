import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/client"
import { useConnectionStore } from "@/store/connection"

/**
 * Singleton SDK client instance. Recreated when the server URL changes.
 *
 * Access via `getClient()` outside React or `useClient()` in components.
 * The client is configured with the server URL and directory from the
 * connection store. Authentication headers are injected if credentials exist.
 */
let client: OpencodeClient | null = null

export function getClient(): OpencodeClient {
  if (!client) throw new Error("SDK client not initialized — call connect() first")
  return client
}

export function createClient(url: string, directory?: string): OpencodeClient {
  const auth = useConnectionStore.getState().auth
  const headers: Record<string, string> = {}

  if (directory) {
    headers["x-opencode-directory"] = directory
  }

  if (auth) {
    headers["Authorization"] = `Basic ${btoa(`${auth.username}:${auth.password}`)}`
  }

  client = createOpencodeClient({
    baseUrl: url,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  })

  return client
}

export function clearClient() {
  client = null
}
