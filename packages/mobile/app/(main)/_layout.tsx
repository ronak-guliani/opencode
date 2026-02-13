import { useCallback, useState } from "react"
import { View, StyleSheet, useWindowDimensions } from "react-native"
import { Stack, useRouter } from "expo-router"
import { Drawer } from "react-native-drawer-layout"
import { Sidebar } from "../../src/components/sidebar"
import { ConnectionBanner } from "../../src/components/connection-banner"
import { useTheme } from "../../src/theme"

export default function MainLayout() {
  const theme = useTheme()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const isTablet = width >= 768
  const [open, setOpen] = useState(isTablet)

  const onSelectSession = useCallback(
    (id: string) => {
      if (!isTablet) setOpen(false)
      router.push(`/(main)/session/${id}`)
    },
    [isTablet],
  )

  const onNewSession = useCallback(() => {
    if (!isTablet) setOpen(false)
    router.push("/(main)/session")
  }, [isTablet])

  const onSettings = useCallback(() => {
    if (!isTablet) setOpen(false)
    router.push("/(main)/settings")
  }, [isTablet])

  const onProjectChange = useCallback(() => {
    router.replace("/(main)/session")
    if (!isTablet) setOpen(false)
  }, [isTablet])

  return (
    <Drawer
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      drawerType={isTablet ? "permanent" : "slide"}
      drawerStyle={{
        width: 300,
        backgroundColor: theme.colors.background,
      }}
      renderDrawerContent={() => (
        <Sidebar onSelect={onSelectSession} onNew={onNewSession} onSettings={onSettings} onProjectChange={onProjectChange} />
      )}
    >
      <View style={[styles.content, { backgroundColor: theme.colors.background }]}>
        <ConnectionBanner />
        <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
          <Stack.Screen name="session" />
          <Stack.Screen
            name="settings"
            options={{
              presentation: "formSheet",
              headerShown: false,
              sheetGrabberVisible: true,
              sheetCornerRadius: 20,
            }}
          />
        </Stack>
      </View>
    </Drawer>
  )
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
})
