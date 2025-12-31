import { useEffect, useState } from "react"
import { View, ActivityIndicator, StyleSheet } from "react-native"
import { Slot } from "expo-router"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { loadServerConfig } from "@/store/server"
import { initializeAuth } from "@/store/auth"
import { ToastContainer } from "@/components/Toast"

export default function RootLayout() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      await Promise.all([loadServerConfig(), initializeAuth()])
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
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <Slot />
        <ToastContainer />
      </SafeAreaProvider>
    </GestureHandlerRootView>
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
