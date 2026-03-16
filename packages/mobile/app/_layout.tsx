import { useEffect, useState } from "react"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { StyleSheet, Text, TextInput } from "react-native"
import { useConnection } from "../src/store/connection"
import { useSettings } from "../src/store/settings"
import { bootstrap } from "../src/api/bootstrap"
import { useTheme } from "../src/theme"

type TextDefaultsCarrier = {
  defaultProps?: {
    style?: unknown
  }
}

type GlobalWithFontDefaults = typeof globalThis & {
  __OPENCODE_MOBILE_FONT_DEFAULTS_SET__?: boolean
}

function applyGlobalFontDefaults() {
  const globalState = globalThis as GlobalWithFontDefaults
  if (globalState.__OPENCODE_MOBILE_FONT_DEFAULTS_SET__) return
  globalState.__OPENCODE_MOBILE_FONT_DEFAULTS_SET__ = true

  TextWithDefaults.defaultProps = TextWithDefaults.defaultProps ?? {}
  TextInputWithDefaults.defaultProps = TextInputWithDefaults.defaultProps ?? {}

  TextWithDefaults.defaultProps.style = [{ fontFamily: "Geist" }, TextWithDefaults.defaultProps.style]
  TextInputWithDefaults.defaultProps.style = [{ fontFamily: "Geist" }, TextInputWithDefaults.defaultProps.style]
}

const TextWithDefaults = Text as unknown as TextDefaultsCarrier
const TextInputWithDefaults = TextInput as unknown as TextDefaultsCarrier

applyGlobalFontDefaults()

export default function RootLayout() {
  const [ready, setReady] = useState(false)
  const restore = useConnection((s) => s.restore)
  const restoreAppearance = useSettings((s) => s.restoreAppearance)
  const theme = useTheme()
  const statusBarStyle = theme.colors.background === "#09090b" ? "light" : "dark"

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [restored] = await Promise.all([restore(), restoreAppearance()])
        if (restored) {
          // Note: We call bootstrap() directly here (not connectAndBootstrap) because:
          // - This is app startup, not a user-initiated connection
          // - Connection already exists from restore() — we're just hydrating session state
          // - connectAndBootstrap is for user-driven connect/server-switch flows
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
        <StatusBar style={statusBarStyle} />
      </KeyboardProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
