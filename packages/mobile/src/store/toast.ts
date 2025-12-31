import { create } from "zustand"
import { errorNotification, successNotification, lightImpact } from "@/utils/haptics"

export type ToastType = "error" | "success" | "info"

export type Toast = {
  id: string
  type: ToastType
  message: string
  action?: {
    label: string
    onPress: () => void
  }
  duration?: number
}

type ToastState = {
  toasts: Toast[]
  show: (toast: Omit<Toast, "id">) => void
  dismiss: (id: string) => void
  dismissAll: () => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  show: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }))

    const duration = toast.duration ?? 4000
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }))
      }, duration)
    }
  },

  dismiss: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },

  dismissAll: () => {
    set({ toasts: [] })
  },
}))

export const showErrorToast = (message: string, action?: Toast["action"]) => {
  errorNotification()
  useToastStore.getState().show({ type: "error", message, action })
}

export const showSuccessToast = (message: string) => {
  successNotification()
  useToastStore.getState().show({ type: "success", message })
}

export const showInfoToast = (message: string) => {
  lightImpact()
  useToastStore.getState().show({ type: "info", message })
}
