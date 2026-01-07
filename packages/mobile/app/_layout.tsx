import { useEffect, useState } from "react"
import { View, ActivityIndicator, StyleSheet } from "react-native"
import { Slot } from "expo-router"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaProvider } from "react-native-safe-area-context"
import * as Font from "expo-font"
import { loadServerConfig } from "@/store/server"
import { initializeAuth } from "@/store/auth"
import { ToastContainer } from "@/components/Toast"
import { KeyboardControllerProvider } from "@/components/KeyboardController"

export default function RootLayout() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      await Promise.all([
        loadServerConfig(),
        initializeAuth(),
        Font.loadAsync({
          "IBMPlexMono-Regular": require("../assets/fonts/IBMPlexMono-Regular.ttf"),
          "IBMPlexMono-Medium": require("../assets/fonts/IBMPlexMono-Medium.ttf"),
          "IBMPlexMono-SemiBold": require("../assets/fonts/IBMPlexMono-SemiBold.ttf"),
          "IBMPlexMono-Bold": require("../assets/fonts/IBMPlexMono-Bold.ttf"),
        }),
      ])
      setReady(true)
    }
    init()
  }, [])

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    )
  }

  return (
    <KeyboardControllerProvider>
      <GestureHandlerRootView style={styles.flex}>
        <SafeAreaProvider>
          <Slot />
          <ToastContainer />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </KeyboardControllerProvider>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000000",
  },
})
