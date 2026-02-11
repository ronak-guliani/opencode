import AsyncStorage from "@react-native-async-storage/async-storage"
import { create as createStore } from "zustand"
import type { Config, ProviderListResponse } from "@opencode-ai/sdk/client"
import { client } from "../api/client"

type ModelKey = { providerID: string; modelID: string }
type Appearance = "light" | "dark" | "system"

type SettingsState = {
  config: Config | null
  providerData: ProviderListResponse | null
  model: ModelKey | null
  appearance: Appearance
  fetchConfig: () => Promise<void>
  fetchProviders: () => Promise<void>
  setModel: (m: ModelKey | null) => void
  setAppearance: (a: Appearance) => void
  restoreAppearance: () => Promise<void>
}

const APPEARANCE_KEY = "appearance"
const MODEL_KEY = "selected_model"

export function modelName(state: SettingsState): string {
  if (!state.model || !state.providerData) return "Default"
  for (const provider of state.providerData.all) {
    if (provider.id !== state.model.providerID) continue
    const info = provider.models[state.model.modelID]
    if (info) return info.name || state.model.modelID
  }
  return state.model.modelID
}

export const useSettings = createStore<SettingsState>((set) => ({
  config: null,
  providerData: null,
  model: null,
  appearance: "system",

  fetchConfig: async () => {
    try {
      const result = await client().config.get()
      if (result.data) set({ config: result.data })
    } catch {
      // ignore
    }
  },

  fetchProviders: async () => {
    try {
      const result = await client().provider.list()
      if (result.data) {
        if (__DEV__) {
          const d = result.data
          console.log("[providers] connected:", d.connected)
          console.log("[providers] all IDs:", d.all.map((p) => p.id))
          for (const p of d.all) {
            const keys = Object.keys(p.models)
            const toolCall = keys.filter((k) => p.models[k].tool_call)
            console.log(`[providers] ${p.id}: ${keys.length} models, ${toolCall.length} with tool_call`)
          }
        }
        set({ providerData: result.data })
      } else if (__DEV__) {
        console.warn("[providers] no data in response", result)
      }
    } catch (e) {
      if (__DEV__) console.warn("[providers] fetch failed:", e)
    }
  },

  setModel: (model) => {
    set({ model })
    if (model) {
      AsyncStorage.setItem(MODEL_KEY, JSON.stringify(model))
    } else {
      AsyncStorage.removeItem(MODEL_KEY)
    }
  },

  setAppearance: (appearance) => {
    set({ appearance })
    AsyncStorage.setItem(APPEARANCE_KEY, appearance)
  },

  restoreAppearance: async () => {
    const [stored, modelRaw] = await Promise.all([
      AsyncStorage.getItem(APPEARANCE_KEY),
      AsyncStorage.getItem(MODEL_KEY),
    ])
    const updates: Partial<SettingsState> = {}
    if (stored === "light" || stored === "dark" || stored === "system") {
      updates.appearance = stored
    }
    if (modelRaw) {
      try {
        updates.model = JSON.parse(modelRaw)
      } catch {
        // ignore
      }
    }
    set(updates)
  },
}))
