import { useSessions } from "../store/sessions"
import { useSettings } from "../store/settings"
import { useRequests } from "../store/requests"
import { subscribe, unsubscribe } from "./events"

export type BootstrapStatus = "loading" | "partial" | "complete" | "error"

export type BootstrapResult = {
  status: BootstrapStatus
  error?: string
}

export async function bootstrap(): Promise<BootstrapResult> {
  try {
    // Phase 1 — blocking
    await Promise.all([
      useSettings.getState().fetchProviders(),
      useSettings.getState().fetchProviderAuth(),
      useSettings.getState().fetchConfig(),
    ])

    // Phase 2 — non-blocking (load in background)
    Promise.all([
      useSessions.getState().fetch(),
      useSessions.getState().fetchStatuses(),
      useRequests.getState().refresh(),
    ]).catch(() => {
      // non-critical
    })

    // Start SSE with current connection headers.
    unsubscribe()
    subscribe()

    return { status: "complete" }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bootstrap failed"
    return { status: "error", error: msg }
  }
}
