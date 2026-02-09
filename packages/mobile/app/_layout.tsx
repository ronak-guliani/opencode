import { useEffect } from "react"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { useConnectionStore } from "@/store/connection"

// Initialize Unistyles theme system (side-effect import)
import "@/theme"

/**
 * Root layout wraps the entire app with required providers:
 * - GestureHandlerRootView for gesture support
 * - KeyboardProvider for keyboard-controller
 *
 * On mount, hydrates persisted connection credentials from secure storage.
 */
export default function RootLayout() {
  useEffect(() => {
    useConnectionStore.getState().hydrate()
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider statusBarTranslucent>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="connect" />
          <Stack.Screen name="(main)" />
        </Stack>
      </KeyboardProvider>
    </GestureHandlerRootView>
  )
}
