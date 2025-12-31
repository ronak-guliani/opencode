import { create } from "zustand"
import { type Provider, type Model, OpenCodeClient } from "@/api/client"
import { useServerStore } from "./server"

type SelectedModel = { providerID: string; modelID: string }

type ProviderState = {
  providers: Provider[]
  connected: string[]
  defaults: Record<string, string>
  selectedModel: SelectedModel | null
  loading: boolean
  error: string | null
  lastFetched: number | null
  favorites: SelectedModel[]
  fetchProviders: () => Promise<void>
  setSelectedModel: (model: SelectedModel | null) => void
  toggleFavorite: (model: SelectedModel) => void
  isFavorite: (model: SelectedModel) => boolean
  getSelectedModel: () => SelectedModel | null
  getConnectedModels: () => Array<{ provider: Provider; model: Model }>
  getModel: (providerID: string, modelID: string) => Model | null
}

const CACHE_TTL = 60000

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  connected: [],
  defaults: {},
  selectedModel: null,
  loading: false,
  error: null,
  lastFetched: null,
  favorites: [],

  fetchProviders: async () => {
    const state = get()

    if (state.loading) return

    if (state.lastFetched && Date.now() - state.lastFetched < CACHE_TTL) {
      return
    }

    const { baseUrl, directory } = useServerStore.getState()
    if (!baseUrl) {
      set({ error: "No server URL configured" })
      return
    }

    set({ loading: true, error: null })

    try {
      const client = new OpenCodeClient(baseUrl, directory)
      const result = await client.listProviders()

      const state = get()
      let selected = state.selectedModel

      if (!selected && result.connected.length > 0) {
        const firstProvider = result.all.find((p) => result.connected.includes(p.id))
        if (firstProvider) {
          const defaultModelID = result.default[firstProvider.id]
          const modelID = defaultModelID || Object.keys(firstProvider.models)[0]
          if (modelID) {
            selected = { providerID: firstProvider.id, modelID }
          }
        }
      }

      set({
        providers: result.all,
        connected: result.connected,
        defaults: result.default,
        selectedModel: selected,
        loading: false,
        lastFetched: Date.now(),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch providers"
      set({ loading: false, error: message })
    }
  },

  setSelectedModel: (model) => set({ selectedModel: model }),

  toggleFavorite: (model) => {
    const { favorites } = get()
    const exists = favorites.some((f) => f.providerID === model.providerID && f.modelID === model.modelID)
    if (exists) {
      set({
        favorites: favorites.filter((f) => !(f.providerID === model.providerID && f.modelID === model.modelID)),
      })
    } else {
      set({ favorites: [...favorites, model] })
    }
  },

  isFavorite: (model) => {
    const { favorites } = get()
    return favorites.some((f) => f.providerID === model.providerID && f.modelID === model.modelID)
  },

  getSelectedModel: () => {
    const { selectedModel, providers, connected, defaults } = get()
    if (selectedModel) return selectedModel

    const connectedProvider = providers.find((p) => connected.includes(p.id))
    if (!connectedProvider) return null

    const defaultModelID = defaults[connectedProvider.id]
    if (defaultModelID) {
      return { providerID: connectedProvider.id, modelID: defaultModelID }
    }

    const firstModel = Object.values(connectedProvider.models)[0]
    if (!firstModel) return null
    return { providerID: connectedProvider.id, modelID: firstModel.id }
  },

  getConnectedModels: () => {
    const { providers, connected } = get()
    const result: Array<{ provider: Provider; model: Model }> = []

    for (const provider of providers) {
      if (!connected.includes(provider.id)) continue
      for (const model of Object.values(provider.models)) {
        result.push({ provider, model })
      }
    }

    return result
  },

  getModel: (providerID: string, modelID: string) => {
    const { providers } = get()
    const provider = providers.find((p) => p.id === providerID)
    if (!provider) return null
    return provider.models[modelID] || null
  },
}))
