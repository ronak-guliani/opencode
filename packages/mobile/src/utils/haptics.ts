import * as Haptics from "expo-haptics"
import { Platform } from "react-native"

const isHapticsSupported = Platform.OS === "ios" || Platform.OS === "android"

export function lightImpact() {
  if (!isHapticsSupported) return
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
}

export function mediumImpact() {
  if (!isHapticsSupported) return
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
}

export function successNotification() {
  if (!isHapticsSupported) return
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
}

export function errorNotification() {
  if (!isHapticsSupported) return
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
}

export function selectionFeedback() {
  if (!isHapticsSupported) return
  Haptics.selectionAsync()
}
