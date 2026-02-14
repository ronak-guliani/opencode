import { create as createStore } from "zustand"

type SidebarState = {
  openSignal: number
  requestOpen: () => void
}

export const useSidebar = createStore<SidebarState>((set) => ({
  openSignal: 0,
  requestOpen: () => set((state) => ({ openSignal: state.openSignal + 1 })),
}))
