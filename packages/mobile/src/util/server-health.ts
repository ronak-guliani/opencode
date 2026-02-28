import { normalizeServerUrl } from "./server"

export type ServerHealth = {
  healthy: boolean
  version?: string
}

export type CheckServerHealthOptions = {
  timeoutMs?: number
  retryCount?: number
  retryDelayMs?: number
  signal?: AbortSignal
  headers?: Record<string, string>
}

const DEFAULT_TIMEOUT_MS = 3_000
const DEFAULT_RETRY_COUNT = 2
const DEFAULT_RETRY_DELAY_MS = 120

type HealthResponse = {
  healthy: boolean
  version?: string
  status?: number
}

function timeoutSignal(timeoutMs: number) {
  const timeout = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout
  if (timeout) {
    try {
      return {
        signal: timeout.call(AbortSignal, timeoutMs),
        clear: undefined as (() => void) | undefined,
      }
    } catch {
      // ignore
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  }
}

function isAbortError(error: unknown) {
  return !!error && typeof error === "object" && "name" in error && (error as { name?: string }).name === "AbortError"
}

function isRetryableError(error: unknown, signal?: AbortSignal) {
  if (signal?.aborted || isAbortError(error)) return false
  if (error instanceof TypeError) return true
  if (!(error instanceof Error)) return false
  return /network|fetch|econnreset|econnrefused|enotfound|timedout|timeout/i.test(error.message)
}

function shouldRetryStatus(status?: number) {
  if (!status) return false
  return status >= 500 || status === 429
}

function parseHealthPayload(payload: unknown): { healthy: boolean; version?: string } {
  if (!payload || typeof payload !== "object") return { healthy: false }
  const source = payload as { healthy?: unknown; version?: unknown }
  return {
    healthy: source.healthy === true,
    version: typeof source.version === "string" ? source.version : undefined,
  }
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"))
      return
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error("Aborted"))
    }

    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

async function requestHealth(url: string, headers: Record<string, string> | undefined, signal?: AbortSignal) {
  const response = await fetch(`${url}/global/health`, {
    method: "GET",
    headers,
    signal,
  })

  if (!response.ok) {
    return {
      healthy: false,
      status: response.status,
    } satisfies HealthResponse
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return { healthy: false, status: response.status } satisfies HealthResponse
  }

  const parsed = parseHealthPayload(payload)
  return {
    healthy: parsed.healthy,
    version: parsed.version,
    status: response.status,
  } satisfies HealthResponse
}

export async function checkServerHealth(rawUrl: string, opts?: CheckServerHealthOptions): Promise<ServerHealth> {
  const normalized = normalizeServerUrl(rawUrl)
  if (!normalized) return { healthy: false }

  const retryCount = Math.max(0, opts?.retryCount ?? DEFAULT_RETRY_COUNT)
  const retryDelayMs = Math.max(0, opts?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS)
  const timeout = opts?.signal ? undefined : timeoutSignal(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const signal = opts?.signal ?? timeout?.signal

  try {
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        const result = await requestHealth(normalized, opts?.headers, signal)
        if (result.healthy) {
          return { healthy: true, version: result.version }
        }

        if (attempt >= retryCount || !shouldRetryStatus(result.status)) {
          return { healthy: false, version: result.version }
        }
      } catch (error) {
        if (attempt >= retryCount || !isRetryableError(error, signal)) {
          return { healthy: false }
        }
      }

      try {
        await wait(retryDelayMs * (attempt + 1), signal)
      } catch {
        return { healthy: false }
      }
    }

    return { healthy: false }
  } finally {
    timeout?.clear?.()
  }
}
