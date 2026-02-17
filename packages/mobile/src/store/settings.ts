import AsyncStorage from "@react-native-async-storage/async-storage"
import { create as createStore } from "zustand"
import type { Config, ProviderAuthResponse, ProviderListResponse } from "@opencode-ai/sdk/client"
import { client } from "../api/client"

type ModelKey = { providerID: string; modelID: string }
type Appearance = "light" | "dark" | "system"
type ModelMap = Record<string, true>

type SettingsState = {
  config: Config | null
  providerData: ProviderListResponse | null
  providerAuth: ProviderAuthResponse | null
  model: ModelKey | null
  favorites: ModelMap
  removed: ModelMap
  appearance: Appearance
  fetchConfig: () => Promise<void>
  fetchProviders: () => Promise<void>
  fetchProviderAuth: () => Promise<void>
  setModel: (m: ModelKey | null) => void
  toggleFavorite: (m: ModelKey) => void
  removeModel: (m: ModelKey) => void
  restoreModel: (m: ModelKey) => void
  setAppearance: (a: Appearance) => void
  restoreAppearance: () => Promise<void>
}

const APPEARANCE_KEY = "appearance"
const MODEL_KEY = "selected_model"
const FAVORITE_MODELS_KEY = "favorite_models"
const REMOVED_MODELS_KEY = "removed_models"
const DEBUG_PROVIDER_FETCH =
  __DEV__ &&
  (globalThis as { __OPENCODE_MOBILE_PROVIDER_DEBUG__?: boolean }).__OPENCODE_MOBILE_PROVIDER_DEBUG__ === true

export function modelKey(model: ModelKey) {
  return `${model.providerID}:${model.modelID}`
}

function parse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function decode(raw: string | null) {
  const list = parse<Array<string>>(raw)
  if (!Array.isArray(list)) return {}
  return Object.fromEntries(list.filter((item) => typeof item === "string").map((item) => [item, true]))
}

function encode(map: ModelMap) {
  const list = Object.keys(map)
  if (!list.length) return null
  return JSON.stringify(list)
}

function saveMap(storageKey: string, map: ModelMap) {
  const raw = encode(map)
  if (!raw) {
    AsyncStorage.removeItem(storageKey)
    return
  }
  AsyncStorage.setItem(storageKey, raw)
}

function knownModels(providerData: ProviderListResponse) {
  const connected = new Set(providerData.connected)
  const models = new Set<string>()

  for (const provider of providerData.all) {
    if (!connected.has(provider.id)) continue
    for (const [modelID, info] of Object.entries(provider.models)) {
      if (info.status === "deprecated") continue
      models.add(`${provider.id}:${info.id || modelID}`)
    }
  }

  return models
}

function keepKnown(map: ModelMap, known: Set<string>) {
  const keys = Object.keys(map).filter((key) => known.has(key))
  return Object.fromEntries(keys.map((key) => [key, true]))
}

function hasModel(providerData: ProviderListResponse, providerID: string, modelID: string) {
  const provider = providerData.all.find((item) => item.id === providerID)
  if (!provider) return false
  return Object.entries(provider.models).some(([key, info]) => (info.id || key) === modelID)
}

function getModel(providerData: ProviderListResponse, providerID: string, modelID: string) {
  const provider = providerData.all.find((item) => item.id === providerID)
  if (!provider) return null
  const entry = Object.entries(provider.models).find(([key, info]) => (info.id || key) === modelID)
  return entry?.[1] || null
}

export function modelName(state: SettingsState): string {
  if (!state.model || !state.providerData) return "Default"
  const info = getModel(state.providerData, state.model.providerID, state.model.modelID)
  if (info) return info.name || state.model.modelID
  return state.model.modelID
}

export const useSettings = createStore<SettingsState>((set, get) => ({
  config: null,
  providerData: null,
  providerAuth: null,
  model: null,
  favorites: {},
  removed: {},
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
        const state = get()
        const providerData = result.data
        const known = knownModels(providerData)
        const favorites = keepKnown(state.favorites, known)
        const removed = keepKnown(state.removed, known)
        let nextModel = selected
        if (selected) {
          const connected = providerData.connected.includes(selected.providerID)
          const exists = hasModel(providerData, selected.providerID, selected.modelID)
          if (!connected || !exists) {
            nextModel = null
            AsyncStorage.removeItem(MODEL_KEY)
          }
          if (removed[modelKey(selected)]) {
            nextModel = null
            AsyncStorage.removeItem(MODEL_KEY)
          }
        }
        set({ providerData, model: nextModel, favorites, removed })
        saveMap(FAVORITE_MODELS_KEY, favorites)
        saveMap(REMOVED_MODELS_KEY, removed)
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

  toggleFavorite: (model) => {
    const key = modelKey(model)
    const state = get()

    if (state.favorites[key]) {
      const favorites = { ...state.favorites }
      delete favorites[key]
      set({ favorites })
      saveMap(FAVORITE_MODELS_KEY, favorites)
      return
    }

    const favorites = { ...state.favorites, [key]: true }
    if (state.removed[key]) {
      const removed = { ...state.removed }
      delete removed[key]
      set({ favorites, removed })
      saveMap(FAVORITE_MODELS_KEY, favorites)
      saveMap(REMOVED_MODELS_KEY, removed)
      return
    }

    set({ favorites })
    saveMap(FAVORITE_MODELS_KEY, favorites)
  },

  removeModel: (model) => {
    const key = modelKey(model)
    const state = get()
    if (state.removed[key]) return

    const removed = { ...state.removed, [key]: true }
    const updates: Partial<SettingsState> = { removed }

    if (state.favorites[key]) {
      const favorites = { ...state.favorites }
      delete favorites[key]
      updates.favorites = favorites
      saveMap(FAVORITE_MODELS_KEY, favorites)
    }

    if (state.model && modelKey(state.model) === key) {
      updates.model = null
      AsyncStorage.removeItem(MODEL_KEY)
    }

    set(updates)
    saveMap(REMOVED_MODELS_KEY, removed)
  },

  restoreModel: (model) => {
    const key = modelKey(model)
    const state = get()
    if (!state.removed[key]) return
    const removed = { ...state.removed }
    delete removed[key]
    set({ removed })
    saveMap(REMOVED_MODELS_KEY, removed)
  },

  setAppearance: (appearance) => {
    set({ appearance })
    AsyncStorage.setItem(APPEARANCE_KEY, appearance)
  },

  restoreAppearance: async () => {
    const [stored, modelRaw, favoriteRaw, removedRaw] = await Promise.all([
      AsyncStorage.getItem(APPEARANCE_KEY),
      AsyncStorage.getItem(MODEL_KEY),
      AsyncStorage.getItem(FAVORITE_MODELS_KEY),
      AsyncStorage.getItem(REMOVED_MODELS_KEY),
    ])
    const updates: Partial<SettingsState> = {}
    if (stored === "light" || stored === "dark" || stored === "system") {
      updates.appearance = stored
    }
    updates.favorites = decode(favoriteRaw)
    updates.removed = decode(removedRaw)
    if (modelRaw) {
      const model = parse<ModelKey>(modelRaw)
      if (model) updates.model = model
    }
    set(updates)
  },
}))
