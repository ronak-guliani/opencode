import { useCallback, useContext, useEffect, useMemo, useState } from "react"
import { View, StyleSheet, useWindowDimensions, Platform, type ViewProps } from "react-native"
import { Stack, useRouter } from "expo-router"
import { Drawer, DrawerGestureContext, useDrawerProgress } from "react-native-drawer-layout"
import Animated, { interpolate, useAnimatedStyle } from "react-native-reanimated"
import type { Session } from "@opencode-ai/sdk/client"
import { Sidebar } from "../../src/components/sidebar"
import { SessionDiffPanel } from "../../src/components/session-diff-panel"
import { ConnectionBanner } from "../../src/components/connection-banner"
import { useTheme } from "../../src/theme"
import { useSessions } from "../../src/store/sessions"
import { useConnection } from "../../src/store/connection"
import { useSidebar } from "../../src/store/sidebar"
import { addCrashBreadcrumb } from "../../src/perf/crash-breadcrumbs"
import { telemetry } from "../../src/perf/telemetry"

const AnimatedView = Animated.View as React.ComponentType<ViewProps & { style?: unknown; children?: React.ReactNode }>
const SWIPE_SURFACE_OVERLAY_OPACITY = 0.14
const DRAWER_SWIPE_MIN_DISTANCE = 12
const DRAWER_SWIPE_MIN_VELOCITY = 220

export default function MainLayout() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const isTablet = width >= 768
  const [open, setOpen] = useState(isTablet)
  const [diffOpen, setDiffOpen] = useState(false)
  const currentSessionID = useSessions((s) => s.current)
  const select = useSessions((s) => s.select)
  const directory = useConnection((s) => s.directory)
  const switchDirectory = useConnection((s) => s.switchDirectory)
  const openSignal = useSidebar((s) => s.openSignal)

  useEffect(() => {
    setOpen(isTablet)
  }, [isTablet])

  // Close diff panel when session changes
  useEffect(() => {
    setDiffOpen(false)
  }, [currentSessionID])

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
      telemetry.track("session", "session:switch", { sessionID: session.id })
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

  const onNewSession = useCallback(
    async (worktree?: string) => {
      telemetry.track("session", "session:new", { worktree: worktree ?? null })
      if (worktree && worktree !== directory) {
        await switchDirectory(worktree)
      }
      select(null)
      if (!isTablet) setOpenIfChanged(false)
      router.replace("/(main)/session")
    },
    [directory, isTablet, router, select, setOpenIfChanged, switchDirectory],
  )

  const onSettings = useCallback(() => {
    if (!isTablet) setOpenIfChanged(false)
    router.push("/(main)/settings")
  }, [isTablet, router, setOpenIfChanged])

  const onServerSwitched = useCallback(() => {
    if (isTablet) return
    setOpenIfChanged(false)
  }, [isTablet, setOpenIfChanged])

  const sidebarDrawerStyle = useMemo(
    () => ({
      width: isTablet ? 320 : width,
      backgroundColor: "transparent",
    }),
    [isTablet, width],
  )

  const diffDrawerStyle = useMemo(
    () => ({
      width: isTablet ? width - 320 : width,
      backgroundColor: "transparent",
    }),
    [isTablet, width],
  )

  const renderSidebarContent = useCallback(
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
        if (!isTablet) {
          telemetry.track("drawer", "drawer:left:open")
          setOpenIfChanged(true)
        }
      }}
      onClose={() => {
        if (!isTablet) {
          telemetry.track("drawer", "drawer:left:close")
          setOpenIfChanged(false)
        }
      }}
      drawerType={isTablet ? "permanent" : "slide"}
      swipeEnabled={!isTablet && !diffOpen}
      swipeEdgeWidth={isTablet ? 0 : width}
      swipeMinDistance={DRAWER_SWIPE_MIN_DISTANCE}
      swipeMinVelocity={DRAWER_SWIPE_MIN_VELOCITY}
      overlayStyle={styles.drawerOverlay}
      drawerStyle={sidebarDrawerStyle}
      renderDrawerContent={renderSidebarContent}
    >
      <LeftOverlay isTablet={isTablet}>
        <RightDrawer
          isTablet={isTablet}
          diffOpen={diffOpen}
          setDiffOpen={setDiffOpen}
          currentSessionID={currentSessionID}
          sidebarOpen={open}
          diffDrawerStyle={diffDrawerStyle}
        />
      </LeftOverlay>
    </Drawer>
  )
}

function RightDrawer({
  isTablet,
  diffOpen,
  setDiffOpen,
  currentSessionID,
  sidebarOpen,
  diffDrawerStyle,
}: {
  isTablet: boolean
  diffOpen: boolean
  setDiffOpen: (open: boolean) => void
  currentSessionID: string | null
  sidebarOpen: boolean
  diffDrawerStyle: { width: number; backgroundColor: string }
}) {
  const { width } = useWindowDimensions()
  const parentGesture = useContext(DrawerGestureContext as React.Context<unknown>)

  const renderDiffContent = useCallback(
    () =>
      currentSessionID ? (
        <SessionDiffPanel sessionId={currentSessionID} />
      ) : (
        <View style={{ flex: 1, backgroundColor: "#18181b" }} />
      ),
    [currentSessionID],
  )

  // Disable right drawer swipe when left sidebar is open (gesture conflict)
  const swipeEnabled = !!currentSessionID && !sidebarOpen && !isTablet

  // Let both drawer gestures run simultaneously so each direction works independently
  const configureGesture = useCallback(
    (gesture: Parameters<NonNullable<React.ComponentProps<typeof Drawer>["configureGestureHandler"]>>[0]) => {
      if (parentGesture) return gesture.simultaneousWithExternalGesture(parentGesture as never)
      return gesture
    },
    [parentGesture],
  )

  return (
    <Drawer
      drawerPosition="right"
      open={diffOpen}
      onOpen={() => {
        telemetry.track("drawer", "drawer:right:open")
        setDiffOpen(true)
      }}
      onClose={() => {
        telemetry.track("drawer", "drawer:right:close")
        setDiffOpen(false)
      }}
      drawerType="slide"
      swipeEnabled={swipeEnabled}
      swipeEdgeWidth={width}
      swipeMinDistance={DRAWER_SWIPE_MIN_DISTANCE}
      swipeMinVelocity={DRAWER_SWIPE_MIN_VELOCITY}
      configureGestureHandler={configureGesture}
      overlayStyle={styles.drawerOverlay}
      drawerStyle={diffDrawerStyle}
      renderDrawerContent={renderDiffContent}
    >
      <RightOverlay isTablet={isTablet}>
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
      </RightOverlay>
    </Drawer>
  )
}

function LeftOverlay({ isTablet, children }: { isTablet: boolean; children: React.ReactNode }) {
  const theme = useTheme()
  const progress = useDrawerProgress()

  const overlayStyle = useAnimatedStyle(
    () => ({
      opacity: isTablet ? 0 : interpolate(progress.value, [0, 1], [0, SWIPE_SURFACE_OVERLAY_OPACITY]),
    }),
    [isTablet],
  )

  return (
    <View style={[styles.content, { backgroundColor: theme.colors.background }]}>
      {children}
      {!isTablet && Platform.OS === "ios" ? (
        <AnimatedView pointerEvents="none" style={[styles.blurOverlay, overlayStyle]}>
          <View style={[styles.blurTint, { backgroundColor: theme.colors.background }]} />
        </AnimatedView>
      ) : null}
    </View>
  )
}

function RightOverlay({ isTablet, children }: { isTablet: boolean; children: React.ReactNode }) {
  const theme = useTheme()
  const progress = useDrawerProgress()

  const overlayStyle = useAnimatedStyle(
    () => ({
      opacity: isTablet ? 0 : interpolate(progress.value, [0, 1], [0, SWIPE_SURFACE_OVERLAY_OPACITY]),
    }),
    [isTablet],
  )

  return (
    <View style={[styles.content, { backgroundColor: theme.colors.background }]}>
      {children}
      {!isTablet && Platform.OS === "ios" ? (
        <AnimatedView pointerEvents="none" style={[styles.blurOverlay, overlayStyle]}>
          <View style={[styles.blurTint, { backgroundColor: theme.colors.background }]} />
        </AnimatedView>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  blurTint: {
    ...StyleSheet.absoluteFillObject,
  },
  drawerOverlay: {
    backgroundColor: "transparent",
  },
})
