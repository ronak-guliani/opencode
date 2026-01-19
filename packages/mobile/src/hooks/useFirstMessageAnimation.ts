import { useEffect, useCallback } from 'react'
import { useWindowDimensions } from 'react-native'
import {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  withSpring,
  runOnJS,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated'

interface UseFirstMessageAnimationParams {
  disabled: boolean
  isFirstUserMessage: boolean
  keyboardHeight: SharedValue<number>
  isMessageSendAnimating: SharedValue<boolean>
}

interface AnimationConfig {
  start: {
    translateY: number
    progress: number
  }
  end: {
    translateY: number
    progress: number
  }
  duration: number
  springConfig: {
    damping: 20
    stiffness: 100
    mass: 1
  }
}

const getAnimatedValues = (
  itemHeight: number,
  windowHeight: number,
  keyboardHeight: number
): AnimationConfig => {
  'worklet'
  
  // Calculate how far from bottom we want the message to land
  // Account for keyboard height and some padding
  const targetOffset = keyboardHeight + 80
  
  // Start from below screen
  const startY = windowHeight / 2
  
  // End position: slide to top with keyboard offset
  const endY = -Math.max(0, itemHeight - targetOffset)

  return {
    start: {
      translateY: startY,
      progress: 0,
    },
    end: {
      translateY: endY,
      progress: 1,
    },
    duration: 350,
    springConfig: {
      damping: 20,
      stiffness: 100,
      mass: 1,
    },
  }
}

export function useFirstMessageAnimation({
  disabled,
  isFirstUserMessage,
  keyboardHeight,
  isMessageSendAnimating,
}: UseFirstMessageAnimationParams) {
  const { height: windowHeight } = useWindowDimensions()
  
  // Animation state
  const translateY = useSharedValue(0)
  const progress = useSharedValue(-1)
  const itemHeight = useSharedValue(0)
  
  // Measurement callback (runs on JS thread)
  const onLayout = useCallback((event: any) => {
    const height = event.nativeEvent.layout.height
    itemHeight.value = height
  }, [itemHeight])

  // Track animation completion for assistant message
  const didUserMessageAnimate = useDerivedValue(() => {
    return progress.value === 1
  }, [progress])

  // Main animation logic (runs on UI thread)
  useAnimatedReaction(
    () => {
      const didAnimate = progress.get() !== -1
      
      if (disabled || !isFirstUserMessage || didAnimate || !isMessageSendAnimating.get()) {
        return -1
      }
      
      return itemHeight.get()
    },
    (messageHeight) => {
      if (messageHeight <= 0) return
      
      const animatedValues = getAnimatedValues(
        messageHeight,
        windowHeight,
        keyboardHeight.get()
      )
      
      const { start, end, duration, springConfig } = animatedValues
      
      // Initialize at start position instantly
      translateY.set(
        withTiming(start.translateY, { duration: 0 }, () => {
          // Then animate to end position with spring
          translateY.set(withSpring(end.translateY, springConfig))
        })
      )
      
      // Fade in opacity
      progress.set(
        withTiming(start.progress, { duration: 0 }, () => {
          progress.set(
            withTiming(end.progress, { duration }, () => {
              // Mark animation complete
              isMessageSendAnimating.set(false)
            })
          )
        })
      )
    },
    [disabled, isFirstUserMessage, windowHeight, keyboardHeight, isMessageSendAnimating]
  )

  // Animated styles
  const animatedStyle = useAnimatedStyle(() => {
    if (!isFirstUserMessage || disabled) {
      return { opacity: 1, transform: [{ translateY: 0 }] }
    }
    
    return {
      opacity: progress.value === -1 ? 0 : progress.value,
      transform: [{ translateY: translateY.value }],
    }
  }, [isFirstUserMessage, disabled])

  return {
    animatedStyle,
    onLayout,
    didUserMessageAnimate,
  }
}
