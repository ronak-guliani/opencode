import { useEffect } from 'react'
import { useSharedValue, type SharedValue } from 'react-native-reanimated'
import { useKeyboardHandler } from 'react-native-keyboard-controller'

export function useKeyboardHeight(): SharedValue<number> {
  const keyboardHeight = useSharedValue(0)

  useKeyboardHandler({
    onStart: (e) => {
      'worklet'
      keyboardHeight.value = e.height
    },
    onMove: (e) => {
      'worklet'
      keyboardHeight.value = e.height
    },
    onEnd: (e) => {
      'worklet'
      keyboardHeight.value = e.height
    },
  })

  return keyboardHeight
}
