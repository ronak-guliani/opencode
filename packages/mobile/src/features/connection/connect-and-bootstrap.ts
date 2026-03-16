import type { BootstrapResult } from "../../api/bootstrap"
import { toErrorMessage } from "../../util/error-message"

type ServerAuth = {
  username: string
  password: string
}

type Stage = "connect" | "bootstrap" | "refresh"

type ConnectAndBootstrapDeps = {
  connect: (url: string, auth?: ServerAuth) => Promise<void>
  bootstrap: () => Promise<BootstrapResult>
  fetchSessions: () => Promise<void>
  fetchStatuses: () => Promise<void>
}

type ConnectAndBootstrapOptions = {
  url: string
  auth?: ServerAuth
  refreshSessions?: boolean
  requireRefreshSuccess?: boolean
}

export type ConnectAndBootstrapResult =
  | {
      status: "success"
    }
  | {
      status: "error"
      stage: Stage
      error: string
    }

async function resolveDeps(overrides?: Partial<ConnectAndBootstrapDeps>): Promise<ConnectAndBootstrapDeps> {
  if (overrides?.connect && overrides?.bootstrap && overrides?.fetchSessions && overrides?.fetchStatuses) {
    return {
      connect: overrides.connect,
      bootstrap: overrides.bootstrap,
      fetchSessions: overrides.fetchSessions,
      fetchStatuses: overrides.fetchStatuses,
    }
  }

  const [{ useConnection }, { useSessions }, bootstrapApi] = await Promise.all([
    import("../../store/connection"),
    import("../../store/sessions"),
    import("../../api/bootstrap"),
  ])

  return {
    connect: overrides?.connect ?? useConnection.getState().connect,
    bootstrap: overrides?.bootstrap ?? bootstrapApi.bootstrap,
    fetchSessions: overrides?.fetchSessions ?? useSessions.getState().fetch,
    fetchStatuses: overrides?.fetchStatuses ?? useSessions.getState().fetchStatuses,
  }
}

export async function connectAndBootstrap(
  options: ConnectAndBootstrapOptions,
  overrides?: Partial<ConnectAndBootstrapDeps>,
): Promise<ConnectAndBootstrapResult> {
  const deps = await resolveDeps(overrides)
  const targetUrl = options.url.trim()
  if (!targetUrl) {
    return {
      status: "error",
      stage: "connect",
      error: "Server URL is invalid",
    }
  }

  try {
    await deps.connect(targetUrl, options.auth)
  } catch (error) {
    return {
      status: "error",
      stage: "connect",
      error: toErrorMessage(error, "Connection failed"),
    }
  }

  let bootstrapResult: BootstrapResult
  try {
    bootstrapResult = await deps.bootstrap()
  } catch (error) {
    return {
      status: "error",
      stage: "bootstrap",
      error: toErrorMessage(error, "Bootstrap failed"),
    }
  }

  if (bootstrapResult.status === "error") {
    return {
      status: "error",
      stage: "bootstrap",
      error: bootstrapResult.error?.trim() || "Bootstrap failed",
    }
  }

  if (options.refreshSessions) {
    try {
      await Promise.all([deps.fetchSessions(), deps.fetchStatuses()])
    } catch (error) {
      if (options.requireRefreshSuccess) {
        return {
          status: "error",
          stage: "refresh",
          error: toErrorMessage(error, "Connected, but failed to refresh session data"),
        }
      }
    }
  }

  return { status: "success" }
}
