import { useEffect, useState } from "react"
import { View, Text, StyleSheet, ActivityIndicator } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useConnection } from "../store/connection"
import { useTheme } from "../theme"

const RECONNECT_BANNER_DELAY_MS = 5000

export function ConnectionBanner() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const stream = useConnection((s) => s.stream)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    if (stream !== "reconnecting") {
      setShowBanner(false)
      return
    }
    const timer = setTimeout(() => {
      setShowBanner(true)
    }, RECONNECT_BANNER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [stream])

  if (stream !== "reconnecting" || !showBanner) return null

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.warning,
          paddingTop: insets.top + 4,
        },
      ]}
    >
      <ActivityIndicator size="small" color="#fff" />
      <Text style={styles.text}>Reconnecting to server...</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 6,
    zIndex: 100,
  },
  text: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
})
