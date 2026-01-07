import { View, Text, TouchableOpacity, StyleSheet } from "react-native"
import { Stack, usePathname, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

function TabBar() {
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()

  const isSessions = pathname === "/(app)" || pathname === "/(app)/"
  const isSettings = pathname.includes("/settings")

  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom || 20 }]}>
      <TouchableOpacity style={styles.tab} onPress={() => router.push("/(app)")} activeOpacity={0.7}>
        <Text style={[styles.icon, isSessions && styles.activeIcon]}>💬</Text>
        <Text style={[styles.label, isSessions && styles.activeText]}>Sessions</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tab} onPress={() => router.push("/(app)/settings")} activeOpacity={0.7}>
        <Text style={[styles.icon, isSettings && styles.activeIcon]}>⚙️</Text>
        <Text style={[styles.label, isSettings && styles.activeText]}>Settings</Text>
      </TouchableOpacity>
    </View>
  )
}

export default function AppLayout() {
  const pathname = usePathname()
  const showTabBar = !pathname.includes("/session/")

  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen
          name="settings"
          options={{
            animation: "slide_from_right",
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="session/[id]"
          options={{
            animation: "slide_from_right",
            gestureEnabled: true,
          }}
        />
      </Stack>
      {showTabBar && <TabBar />}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d1117",
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#0d1117",
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  icon: {
    fontSize: 20,
    marginBottom: 4,
    opacity: 0.5,
  },
  activeIcon: {
    opacity: 1,
  },
  label: {
    fontSize: 12,
    color: "#666666",
  },
  activeText: {
    color: "#ffffff",
  },
})
