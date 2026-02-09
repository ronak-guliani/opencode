import { create } from "zustand"
import type { Config, Provider } from "@opencode-ai/sdk/client"

interface SettingsState {
  theme: "light" | "dark" | "system"
  config: Config | null
  providers: Provider[]
  /** Bootstrap status: loading -> partial -> complete */
  status: "loading" | "partial" | "complete"
  /** Project info from the server */
  project: { id: string; name?: string; path?: string } | null
}

interface SettingsActions {
  setTheme: (theme: SettingsState["theme"]) => void
  setConfig: (config: Config) => void
  setProviders: (providers: Provider[]) => void
  setStatus: (status: SettingsState["status"]) => void
  setProject: (project: SettingsState["project"]) => void
  reset: () => void
}

type SettingsStore = SettingsState & SettingsActions

const initial: SettingsState = {
  theme: "system",
  config: null,
  providers: [],
  status: "loading",
  project: null,
}

/**
 * Settings store holds app-wide configuration fetched from the server.
 *
 * The `status` field tracks bootstrap progress:
 * - "loading": initial state, blocking requests in progress
 * - "partial": blocking requests done, non-blocking still loading
 * - "complete": all data loaded
 */
export const useSettingsStore = create<SettingsStore>((set) => ({
  ...initial,

  setTheme: (theme) => set({ theme }),
  setConfig: (config) => set({ config }),
  setProviders: (providers) => set({ providers }),
  setStatus: (status) => set({ status }),
  setProject: (project) => set({ project }),
  reset: () => set(initial),
}))
