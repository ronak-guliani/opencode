import { useCallback, useEffect, useMemo, useState } from "react"
import { View, StyleSheet, useWindowDimensions, Platform, type ViewProps } from "react-native"
import { Stack, useRouter } from "expo-router"
import { Drawer, useDrawerProgress } from "react-native-drawer-layout"
import Animated, { interpolate, useAnimatedStyle } from "react-native-reanimated"
import type { Session } from "@opencode-ai/sdk/client"
import { Sidebar } from "../../src/components/sidebar"
import { ConnectionBanner } from "../../src/components/connection-banner"
import { useTheme } from "../../src/theme"
import { useSessions } from "../../src/store/sessions"
import { useConnection } from "../../src/store/connection"
import { useSidebar } from "../../src/store/sidebar"
import { addCrashBreadcrumb } from "../../src/perf/crash-breadcrumbs"

const AnimatedView = Animated.View as React.ComponentType<ViewProps & { style?: unknown; children?: React.ReactNode }>
const SWIPE_SURFACE_OVERLAY_OPACITY = 0.14
const DRAWER_SWIPE_MIN_DISTANCE = 12
const DRAWER_SWIPE_MIN_VELOCITY = 220

export default function MainLayout() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const isTablet = width >= 768
  const [open, setOpen] = useState(isTablet)
  const currentSessionID = useSessions((s) => s.current)
  const select = useSessions((s) => s.select)
  const directory = useConnection((s) => s.directory)
  const switchDirectory = useConnection((s) => s.switchDirectory)
  const openSignal = useSidebar((s) => s.openSignal)

  useEffect(() => {
    setOpen(isTablet)
  }, [isTablet])

  const setOpenIfChanged = useCallback((next: boolean) => {
    setOpen((current) => (current === next ? current : next))
  }, [])
  const sidebarVisible = isTablet || open

  useEffect(() => {
    if (!openSignal || isTablet) return
    setOpenIfChanged(true)
  }, [openSignal, isTablet, setOpenIfChanged])

  const onSelectSession = useCallback(
    (session: Session) => {
      if (session.id === currentSessionID) {
        addCrashBreadcrumb("session-switch:ignored-same-session", { sessionID: session.id })
        if (!isTablet) setOpenIfChanged(false)
        return
      }
      if (!isTablet) setOpenIfChanged(false)
      addCrashBreadcrumb("session-switch:start", {
        sessionID: session.id,
        toDirectory: session.directory,
        currentDirectory: directory,
      })
      addCrashBreadcrumb("session-switch:navigate", { sessionID: session.id })
      router.replace(`/(main)/session/${session.id}`)
    },
    [currentSessionID, directory, isTablet, router, setOpenIfChanged],
  )

  const onNewSession = useCallback(async (worktree?: string) => {
    if (worktree && worktree !== directory) {
      await switchDirectory(worktree)
    }
    select(null)
    if (!isTablet) setOpenIfChanged(false)
    router.replace("/(main)/session")
  }, [directory, isTablet, router, select, setOpenIfChanged, switchDirectory])

  const onSettings = useCallback(() => {
    if (!isTablet) setOpenIfChanged(false)
    router.push("/(main)/settings")
  }, [isTablet, router, setOpenIfChanged])

  const onServerSwitched = useCallback(() => {
    if (isTablet) return
    setOpenIfChanged(false)
  }, [isTablet, setOpenIfChanged])

  const drawerStyle = useMemo(
    () => ({
      width: isTablet ? 320 : width,
      backgroundColor: "transparent",
    }),
    [isTablet, width],
  )

  const renderDrawerContent = useCallback(
    () => (
      <Sidebar
        onSelect={onSelectSession}
        onNew={onNewSession}
        onSettings={onSettings}
        sidebarVisible={sidebarVisible}
        onServerSwitched={onServerSwitched}
      />
    ),
    [onNewSession, onSelectSession, onServerSwitched, onSettings, sidebarVisible],
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
      swipeMinDistance={DRAWER_SWIPE_MIN_DISTANCE}
      swipeMinVelocity={DRAWER_SWIPE_MIN_VELOCITY}
      overlayStyle={styles.drawerOverlay}
      drawerStyle={drawerStyle}
      renderDrawerContent={renderDrawerContent}
    >
      <SlidingContent isTablet={isTablet} />
    </Drawer>
  )
}

function SlidingContent({ isTablet }: { isTablet: boolean }) {
  const theme = useTheme()
  const progress = useDrawerProgress()

  const blurOverlayStyle = useAnimatedStyle(
    () => ({
      opacity: isTablet ? 0 : interpolate(progress.value, [0, 1], [0, SWIPE_SURFACE_OVERLAY_OPACITY]),
    }),
    [isTablet],
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
            gestureDirection: "vertical",
            sheetGrabberVisible: true,
            sheetCornerRadius: 20,
            sheetExpandsWhenScrolledToEdge: false,
            gestureEnabled: true,
          }}
        />
      </Stack>
      {!isTablet && Platform.OS === "ios" ? (
        <>
          <AnimatedView pointerEvents="none" style={[styles.mainBlurOverlay, blurOverlayStyle]}>
            <View style={[styles.mainBlurTint, { backgroundColor: theme.colors.background }]} />
          </AnimatedView>
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
  mainBlurTint: {
    ...StyleSheet.absoluteFillObject,
  },
  drawerOverlay: {
    backgroundColor: "transparent",
  },
})
