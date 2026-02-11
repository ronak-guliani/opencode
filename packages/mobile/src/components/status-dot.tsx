import { useEffect } from "react"
import { StyleSheet, type ViewProps } from "react-native"
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated"
import type { SessionStatus } from "@opencode-ai/sdk/client"
import { useTheme } from "../theme"

const AnimatedView = Animated.View as React.ComponentType<ViewProps & { style?: unknown }>

type Props = {
  status?: SessionStatus
}

export function AnimatedStatusDot({ status }: Props) {
  const theme = useTheme()
  const scale = useSharedValue(1)
  const opacity = useSharedValue(1)

  const busy = status?.type === "busy"
  const color =
    status?.type === "busy"
      ? theme.colors.statusBusy
      : status?.type === "retry"
        ? theme.colors.statusError
        : theme.colors.statusIdle

  useEffect(() => {
    if (busy) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.4, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      )
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      )
    } else {
      scale.value = withTiming(1, { duration: 200 })
      opacity.value = withTiming(1, { duration: 200 })
    }
  }, [busy])

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))

  return <AnimatedView style={[styles.dot, { backgroundColor: color }, style]} />
}

const styles = StyleSheet.create({
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
})
