import type { OpencodeClient } from "@opencode-ai/sdk/client"
import { useSettingsStore } from "@/store/settings"
import { useSessionStore } from "@/store/sessions"

/**
 * Two-phase bootstrap, mirroring the web app's approach.
 *
 * Phase 1 (blocking): Must succeed before the UI renders the main app.
 *   - GET /project/current — current project info
 *   - GET /config/providers — available providers
 *   - GET /config — app config
 *
 * Phase 2 (non-blocking): Runs in the background, UI shows skeletons.
 *   - GET /session?limit=30 — recent sessions
 *   - GET /session/status — all session statuses
 *
 * Status transitions: "loading" -> "partial" -> "complete"
 *
 * Returns true if blocking phase succeeded, false otherwise.
 */
export async function bootstrap(client: OpencodeClient): Promise<boolean> {
  const settings = useSettingsStore.getState()
  const sessions = useSessionStore.getState()

  settings.setStatus("loading")

  // Phase 1 — Blocking
  try {
    const [project, providers, config] = await Promise.all([
      client.project.current(),
      client.config.providers(),
      client.config.get(),
    ])

    if (project.data) {
      settings.setProject({
        id: project.data.id,
        name: project.data.name,
        path: project.data.path?.root,
      })
    }

    if (providers.data) {
      settings.setProviders(providers.data)
    }

    if (config.data) {
      settings.setConfig(config.data)
    }

    settings.setStatus("partial")
  } catch (err) {
    console.error("[bootstrap] Phase 1 failed:", err)
    return false
  }

  // Phase 2 — Non-blocking (fire and forget)
  Promise.all([
    client.session.list({ query: { limit: 30 } }).then((res) => {
      if (res.data) {
        sessions.setSessions(res.data, res.data.length)
      }
    }),
    client.session.status().then((res) => {
      if (res.data) {
        sessions.setStatuses(res.data as Record<string, any>)
      }
    }),
  ])
    .then(() => settings.setStatus("complete"))
    .catch((err) => {
      console.warn("[bootstrap] Phase 2 partial failure:", err)
      settings.setStatus("complete")
    })

  return true
}
