import { client } from "./client"
import { useSessions } from "../store/sessions"
import { useSettings } from "../store/settings"
import { subscribe } from "./events"

type BootstrapStatus = "loading" | "partial" | "complete" | "error"

type BootstrapResult = {
  status: BootstrapStatus
  error?: string
}

export async function bootstrap(): Promise<BootstrapResult> {
  try {
    // Phase 1 — blocking
    const [providers, config] = await Promise.all([
      useSettings.getState().fetchProviders(),
      useSettings.getState().fetchConfig(),
    ])

    // Phase 2 — non-blocking (load in background)
    Promise.all([useSessions.getState().fetch(), useSessions.getState().fetchStatuses()]).catch(() => {
      // non-critical
    })

    // Start SSE
    subscribe()

    return { status: "complete" }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bootstrap failed"
    return { status: "error", error: msg }
  }
}
