import { View, Text, TouchableOpacity, StyleSheet } from "react-native"
import { useRouter, usePathname } from "expo-router"

type Tab = {
  name: string
  path: string
  icon: string
}

const tabs: Tab[] = [
  { name: "Chat", path: "/(app)", icon: "💬" },
  { name: "Settings", path: "/(app)/settings", icon: "⚙️" },
]

export function TabBar() {
  const router = useRouter()
  const pathname = usePathname()

  const isActive = (path: string) => {
    if (path === "/(app)") {
      return pathname === "/" || pathname === "/(app)"
    }
    return pathname === path || pathname === path.replace("/(app)", "")
  }

  return (
    <View style={styles.container}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.path}
          style={styles.tab}
          onPress={() => router.push(tab.path as any)}
          activeOpacity={0.7}
        >
          <Text style={[styles.icon, isActive(tab.path) && styles.activeIcon]}>{tab.icon}</Text>
          <Text style={[styles.label, isActive(tab.path) && styles.activeText]}>{tab.name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "#000000",
    borderTopWidth: 1,
    borderTopColor: "#1A1A1A",
    paddingBottom: 20,
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
    color: "#FFFFFF",
  },
})
