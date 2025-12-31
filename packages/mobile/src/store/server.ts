import { create } from "zustand"
import * as SecureStore from "expo-secure-store"

type ServerState = {
  baseUrl: string
  directory: string
  isConnected: boolean
  isConnecting: boolean
  setBaseUrl: (url: string) => void
  setDirectory: (dir: string) => void
  setConnected: (value: boolean) => void
  setConnecting: (value: boolean) => void
}

export const useServerStore = create<ServerState>((set) => ({
  baseUrl: "http://localhost:4096",
  directory: "",
  isConnected: false,
  isConnecting: false,
  setBaseUrl: (url) => set({ baseUrl: url }),
  setDirectory: (dir) => set({ directory: dir }),
  setConnected: (value) => set({ isConnected: value }),
  setConnecting: (value) => set({ isConnecting: value }),
}))

export const SERVER_URL_KEY = "opencode_server_url"
export const SERVER_DIR_KEY = "opencode_directory"

export const loadServerConfig = async () => {
  try {
    const url = await SecureStore.getItemAsync(SERVER_URL_KEY)
    const dir = await SecureStore.getItemAsync(SERVER_DIR_KEY)
    const state = useServerStore.getState()
    if (url) state.setBaseUrl(url)
    if (dir) state.setDirectory(dir)
  } catch (error) {
    console.error("Failed to load server config:", error)
  }
}

export const saveServerConfig = async (url: string, directory: string) => {
  try {
    await SecureStore.setItemAsync(SERVER_URL_KEY, url)
    await SecureStore.setItemAsync(SERVER_DIR_KEY, directory)
    useServerStore.getState().setBaseUrl(url)
    useServerStore.getState().setDirectory(directory)
  } catch (error) {
    console.error("Failed to save server config:", error)
  }
}
