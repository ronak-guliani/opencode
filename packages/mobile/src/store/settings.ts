import AsyncStorage from "@react-native-async-storage/async-storage"
import { create as createStore } from "zustand"
import type { Config, ProviderAuthResponse, ProviderListResponse } from "@opencode-ai/sdk/client"
import { client } from "../api/client"

type ModelKey = { providerID: string; modelID: string }
type Appearance = "light" | "dark" | "system"

type SettingsState = {
  config: Config | null
  providerData: ProviderListResponse | null
  providerAuth: ProviderAuthResponse | null
  model: ModelKey | null
  appearance: Appearance
  fetchConfig: () => Promise<void>
  fetchProviders: () => Promise<void>
  fetchProviderAuth: () => Promise<void>
  setModel: (m: ModelKey | null) => void
  setAppearance: (a: Appearance) => void
  restoreAppearance: () => Promise<void>
}

const APPEARANCE_KEY = "appearance"
const MODEL_KEY = "selected_model"
const DEBUG_PROVIDER_FETCH =
  __DEV__ &&
  (globalThis as { __OPENCODE_MOBILE_PROVIDER_DEBUG__?: boolean }).__OPENCODE_MOBILE_PROVIDER_DEBUG__ === true

export function modelName(state: SettingsState): string {
  if (!state.model || !state.providerData) return "Default"
  for (const provider of state.providerData.all) {
    if (provider.id !== state.model.providerID) continue
    const info = provider.models[state.model.modelID]
    if (info) return info.name || state.model.modelID
  }
  return state.model.modelID
}

export const useSettings = createStore<SettingsState>((set, get) => ({
  config: null,
  providerData: null,
  providerAuth: null,
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
        if (DEBUG_PROVIDER_FETCH) {
          const d = result.data
          console.log("[providers] connected:", d.connected)
          console.log("[providers] all IDs:", d.all.map((p) => p.id))
          for (const p of d.all) {
            const keys = Object.keys(p.models)
            const toolCall = keys.filter((k) => p.models[k].tool_call)
            console.log(`[providers] ${p.id}: ${keys.length} models, ${toolCall.length} with tool_call`)
          }
        }
        const selected = get().model
        const providerData = result.data
        let nextModel = selected
        if (selected) {
          const provider = providerData.all.find((item) => item.id === selected.providerID)
          const connected = providerData.connected.includes(selected.providerID)
          const exists = !!provider?.models?.[selected.modelID]
          if (!connected || !exists) {
            nextModel = null
            AsyncStorage.removeItem(MODEL_KEY)
          }
        }
        set({ providerData, model: nextModel })
      } else if (DEBUG_PROVIDER_FETCH) {
        console.warn("[providers] no data in response", result)
      }
    } catch (e) {
      if (DEBUG_PROVIDER_FETCH) console.warn("[providers] fetch failed:", e)
    }
  },

  fetchProviderAuth: async () => {
    try {
      const result = await client().provider.auth()
      if (result.data) {
        set({ providerAuth: result.data })
      }
    } catch {
      // ignore
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
