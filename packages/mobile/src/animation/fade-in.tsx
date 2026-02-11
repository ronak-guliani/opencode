import { useEffect, type ReactNode } from "react"
import { StyleSheet, Text, type ViewProps, type TextProps } from "react-native"
import Animated, { useSharedValue, withTiming, useAnimatedStyle } from "react-native-reanimated"
import { useFadeDisabled } from "./disable-fade"
import { createUsePool } from "./pool"

const AnimatedView = Animated.View as React.ComponentType<ViewProps & { style?: unknown; children?: ReactNode }>
const AnimatedText = Animated.Text as React.ComponentType<TextProps & { style?: unknown; children?: ReactNode }>

// Global pool: max 4 concurrent fade animations
const usePool = createUsePool(4)

const DURATION = 300
const STAGGER = 32

/**
 * Simple fade-in component. Fades from 0 → 1 opacity.
 */
function FadeIn({ children, onComplete }: { children: ReactNode; onComplete?: () => void }) {
  const opacity = useSharedValue(0)

  useEffect(() => {
    opacity.value = withTiming(1, { duration: DURATION }, (finished) => {
      if (finished && onComplete) {
        onComplete()
      }
    })
  }, [])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  return <AnimatedView style={style}>{children}</AnimatedView>
}

/**
 * Wraps content in a pool-managed staggered fade-in.
 * When fade is disabled (e.g. revisiting a chat), renders instantly.
 */
export function FadeInStaggered({ children }: { children: ReactNode }) {
  const disabled = useFadeDisabled()
  const { active, evict } = usePool()

  if (disabled) return <>{children}</>
  if (!active) return <AnimatedView style={styles.hidden}>{children}</AnimatedView>

  return <FadeIn onComplete={evict}>{children}</FadeIn>
}

/**
 * Chunks text into words and fades each word individually via the pool.
 * Creates a natural "typing" feel for streaming content.
 */
export function TextFadeInStaggered({ text, style }: { text: string; style?: unknown }) {
  const disabled = useFadeDisabled()
  const words = text.split(/(\s+)/)

  if (disabled) {
    return <Text style={style as never}>{text}</Text>
  }

  return (
    <Text style={style as never}>
      {words.map((word, i) => (
        <WordFadeIn key={i} word={word} delay={i * STAGGER} />
      ))}
    </Text>
  )
}

function WordFadeIn({ word, delay }: { word: string; delay: number }) {
  const opacity = useSharedValue(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      opacity.value = withTiming(1, { duration: DURATION })
    }, delay)
    return () => clearTimeout(timer)
  }, [])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  return <AnimatedText style={style}>{word}</AnimatedText>
}

const styles = StyleSheet.create({
  hidden: {
    opacity: 0,
  },
})
