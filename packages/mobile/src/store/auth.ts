import { create } from "zustand"

type AuthState = {
  placeholder: boolean
}

export const useAuthStore = create<AuthState>(() => ({
  placeholder: true,
}))
