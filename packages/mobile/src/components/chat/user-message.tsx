import { memo, useEffect } from "react"
import { View, Text, StyleSheet, type ViewProps } from "react-native"
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from "react-native-reanimated"
import type { Message } from "@opencode-ai/sdk/client"
import { useMessageParts } from "../../api/hooks"
import { useTheme } from "../../theme"
import { PartRenderer } from "./part"
import { useFadeDisabled } from "../../animation"

type Props = {
  message: Message
  index: number
}

const AnimatedView = Animated.View as React.ComponentType<ViewProps & { style?: unknown; children?: React.ReactNode }>

export const UserMessage = memo(function UserMessage({ message, index }: Props) {
  const theme = useTheme()
  const parts = useMessageParts(message.id)
  const fadeDisabled = useFadeDisabled()
  const firstMessage = index === 0
  const shouldAnimate = firstMessage && !fadeDisabled

  const text = parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("")

  const opacity = useSharedValue(shouldAnimate ? 0 : 1)
  const translateY = useSharedValue(shouldAnimate ? 12 : 0)

  useEffect(() => {
    if (!shouldAnimate) {
      opacity.value = 1
      translateY.value = 0
      return
    }
    opacity.value = withTiming(1, { duration: 220 })
    translateY.value = withSpring(0, { damping: 16, stiffness: 200, mass: 0.7 })
  }, [shouldAnimate, opacity, translateY])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }))

  return (
    <AnimatedView style={[styles.container, animatedStyle]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: theme.colors.userBubble,
            borderRadius: theme.radii.lg,
          },
        ]}
      >
        {text ? (
          <Text style={[styles.text, { color: theme.colors.userBubbleText }]}>{text}</Text>
        ) : (
          parts.map((part) => <PartRenderer key={part.id} part={part} isUser />)
        )}
      </View>
    </AnimatedView>
  )
})

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-end",
    marginBottom: 12,
  },
  bubble: {
    maxWidth: "85%",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
})
