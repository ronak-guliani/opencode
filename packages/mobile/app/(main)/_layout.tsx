import { useCallback, useEffect, useMemo, useState } from "react"
import { View, StyleSheet, useWindowDimensions, Platform, type ViewProps } from "react-native"
import { Stack, useRouter } from "expo-router"
import { BlurView } from "expo-blur"
import { Drawer, useDrawerProgress } from "react-native-drawer-layout"
import Animated, { interpolate, useAnimatedStyle } from "react-native-reanimated"
import type { Session } from "@opencode-ai/sdk/client"
import { Sidebar } from "../../src/components/sidebar"
import { ConnectionBanner } from "../../src/components/connection-banner"
import { useTheme } from "../../src/theme"
import { useSessions } from "../../src/store/sessions"
import { useMessages } from "../../src/store/messages"
import { useConnection } from "../../src/store/connection"

const AnimatedView = Animated.View as React.ComponentType<ViewProps & { style?: unknown; children?: React.ReactNode }>

export default function MainLayout() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const isTablet = width >= 768
  const [open, setOpen] = useState(isTablet)
  const select = useSessions((s) => s.select)
  const loadMessages = useMessages((s) => s.load)
  const prefetchMessages = useMessages((s) => s.prefetch)
  const directory = useConnection((s) => s.directory)
  const switchDirectory = useConnection((s) => s.switchDirectory)

  useEffect(() => {
    setOpen(isTablet)
  }, [isTablet])

  const setOpenIfChanged = useCallback((next: boolean) => {
    setOpen((current) => (current === next ? current : next))
  }, [])

  const onSelectSession = useCallback(
    async (session: Session) => {
      if (session.directory && session.directory !== directory) {
        await switchDirectory(session.directory)
      }
      select(session.id)
      // Warm only the first chat page before navigation.
      void loadMessages(session.id, { limit: 60, compact: true })

      const likelyNext = useSessions
        .getState()
        .sessions.filter((candidate) => candidate.directory === session.directory && candidate.id !== session.id)
        .slice(0, 2)
        .map((candidate) => candidate.id)
      void prefetchMessages(likelyNext, { limit: 20 })

      if (!isTablet) setOpenIfChanged(false)
      router.replace(`/(main)/session/${session.id}`)
    },
    [isTablet, router, select, loadMessages, prefetchMessages, setOpenIfChanged, directory, switchDirectory],
  )

  const onNewSession = useCallback(() => {
    select(null)
    if (!isTablet) setOpenIfChanged(false)
    router.replace("/(main)/session")
  }, [isTablet, router, select, setOpenIfChanged])

  const onSettings = useCallback(() => {
    if (!isTablet) setOpenIfChanged(false)
    router.push("/(main)/settings")
  }, [isTablet, router, setOpenIfChanged])

  const drawerStyle = useMemo(
    () => ({
      width: isTablet ? 320 : width,
      backgroundColor: "transparent",
    }),
    [isTablet, width],
  )

  const renderDrawerContent = useCallback(
    () => <Sidebar onSelect={onSelectSession} onNew={onNewSession} onSettings={onSettings} />,
    [onSelectSession, onNewSession, onSettings],
  )

  return (
    <Drawer
      open={isTablet ? true : open}
      onOpen={() => {
        if (!isTablet) setOpenIfChanged(true)
      }}
      onClose={() => {
        if (!isTablet) setOpenIfChanged(false)
      }}
      drawerType={isTablet ? "permanent" : "slide"}
      swipeEnabled={!isTablet}
      swipeEdgeWidth={isTablet ? 0 : width}
      swipeMinDistance={28}
      swipeMinVelocity={450}
      overlayStyle={styles.drawerOverlay}
      drawerStyle={drawerStyle}
      renderDrawerContent={renderDrawerContent}
    >
      <SlidingContent isTablet={isTablet} drawerWidth={isTablet ? 320 : width} />
    </Drawer>
  )
}

function SlidingContent({ isTablet, drawerWidth }: { isTablet: boolean; drawerWidth: number }) {
  const theme = useTheme()
  const progress = useDrawerProgress()
  const tint = theme.colors.background === "#09090b" ? "dark" : "light"

  const blurOverlayStyle = useAnimatedStyle(
    () => ({
      opacity: isTablet ? 0 : interpolate(progress.value, [0, 1], [0, 1]),
    }),
    [isTablet],
  )

  const shadeOverlayStyle = useAnimatedStyle(
    () => ({
      opacity: isTablet ? 0 : interpolate(progress.value, [0, 1], [0, 0.18]),
    }),
    [isTablet],
  )

  const drawerBlurStyle = useAnimatedStyle(
    () => ({
      opacity: isTablet ? 0 : interpolate(progress.value, [0, 1], [0, 1]),
      transform: [{ translateX: isTablet ? 0 : drawerWidth * (progress.value - 1) }],
    }),
    [isTablet, drawerWidth],
  )

  return (
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
            gestureEnabled: true,
          }}
        />
      </Stack>
      {!isTablet && Platform.OS === "ios" ? (
        <>
          <AnimatedView
            pointerEvents="none"
            style={[styles.drawerBlurOverlay, { width: drawerWidth }, drawerBlurStyle]}
          >
            <BlurView intensity={94} tint={tint} style={StyleSheet.absoluteFill} />
          </AnimatedView>
          <AnimatedView pointerEvents="none" style={[styles.mainBlurOverlay, blurOverlayStyle]}>
            <BlurView intensity={74} tint={tint} style={StyleSheet.absoluteFill} />
          </AnimatedView>
          <AnimatedView
            pointerEvents="none"
            style={[styles.mainShadeOverlay, { backgroundColor: tint === "dark" ? "#000" : "#fff" }, shadeOverlayStyle]}
          />
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  mainBlurOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  drawerBlurOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    overflow: "hidden",
  },
  mainShadeOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  drawerOverlay: {
    backgroundColor: "transparent",
  },
})
