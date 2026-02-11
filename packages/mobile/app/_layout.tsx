import { useEffect, useState } from "react"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { StyleSheet } from "react-native"
import { useConnection } from "../src/store/connection"
import { useSettings } from "../src/store/settings"
import { bootstrap } from "../src/api/bootstrap"

export default function RootLayout() {
  const [ready, setReady] = useState(false)
  const restore = useConnection((s) => s.restore)
  const restoreAppearance = useSettings((s) => s.restoreAppearance)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [restored] = await Promise.all([restore(), restoreAppearance()])
        if (restored) {
          await bootstrap()
        }
      } finally {
        if (mounted) setReady(true)
      }
    })()
    return () => {
      mounted = false
    }
  }, [restore, restoreAppearance])

  if (!ready) return null

  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="connect" options={{ presentation: "card" }} />
          <Stack.Screen name="(main)" />
        </Stack>
        <StatusBar style="auto" />
      </KeyboardProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
