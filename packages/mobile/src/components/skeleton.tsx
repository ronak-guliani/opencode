import { useEffect } from "react"
import { View, StyleSheet, type ViewProps, type DimensionValue } from "react-native"
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from "react-native-reanimated"
import { useTheme } from "../theme"

const AnimatedView = Animated.View as React.ComponentType<ViewProps & { style?: unknown }>

type Props = {
  width?: DimensionValue
  height?: number
  radius?: number
}

export function Skeleton({ width = "100%", height = 16, radius = 6 }: Props) {
  const theme = useTheme()
  const opacity = useSharedValue(0.3)

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.7, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true)
  }, [])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  return (
    <AnimatedView
      style={[styles.base, { width, height, borderRadius: radius, backgroundColor: theme.colors.surfaceRaised }, style]}
    />
  )
}

export function SessionSkeleton() {
  return (
    <View style={styles.session}>
      <Skeleton width={6} height={6} radius={3} />
      <View style={styles.sessionContent}>
        <Skeleton width="70%" height={14} />
      </View>
      <Skeleton width={32} height={11} />
    </View>
  )
}

export function SessionListSkeleton() {
  return (
    <View style={styles.list}>
      <Skeleton width={60} height={11} />
      <SessionSkeleton />
      <SessionSkeleton />
      <SessionSkeleton />
      <View style={styles.gap} />
      <Skeleton width={80} height={11} />
      <SessionSkeleton />
      <SessionSkeleton />
    </View>
  )
}

export function MessageSkeleton() {
  return (
    <View style={styles.message}>
      <Skeleton width="85%" height={14} />
      <Skeleton width="60%" height={14} />
      <Skeleton width="75%" height={14} />
    </View>
  )
}

const styles = StyleSheet.create({
  base: {},
  session: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  sessionContent: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 8,
    paddingTop: 16,
    gap: 4,
  },
  gap: {
    height: 12,
  },
  message: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
})
