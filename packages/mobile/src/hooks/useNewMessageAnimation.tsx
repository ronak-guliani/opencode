import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useSharedValue, type SharedValue } from 'react-native-reanimated'
import { useKeyboardHeight } from './useKeyboardHeight'

interface NewMessageAnimationContextValue {
  isMessageSendAnimating: SharedValue<boolean>
  keyboardHeight: SharedValue<number>
}

const NewMessageAnimationContext = createContext<NewMessageAnimationContextValue | null>(null)

export function NewMessageAnimationProvider({ children }: { children: ReactNode }) {
  const isMessageSendAnimating = useSharedValue(false)
  const keyboardHeightValue = useKeyboardHeight()

  return (
    <NewMessageAnimationContext.Provider 
      value={{ isMessageSendAnimating, keyboardHeight: keyboardHeightValue }}
    >
      {children}
    </NewMessageAnimationContext.Provider>
  )
}

export function useNewMessageAnimation() {
  const context = useContext(NewMessageAnimationContext)
  if (!context) {
    throw new Error('useNewMessageAnimation must be used within NewMessageAnimationProvider')
  }
  return context
}
