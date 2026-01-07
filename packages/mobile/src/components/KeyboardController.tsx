import { createContext, useContext, useEffect, useMemo, useRef } from "react"
import { View, type ViewProps } from "react-native"
import Constants from "expo-constants"

const isExpoGo = Constants.appOwnership === "expo"

let KeyboardProvider: any = null
let useKeyboardController: any = null
let NativeKeyboardStickyView: any = null

if (!isExpoGo) {
  try {
    const module = require("react-native-keyboard-controller")
    KeyboardProvider = module.KeyboardProvider
    useKeyboardController = module.useKeyboardController
    NativeKeyboardStickyView = module.KeyboardStickyView
  } catch {}
}

const KeyboardControllerRefCountContext = createContext<{
  increment: () => void
  decrement: () => void
}>({
  increment: () => {},
  decrement: () => {},
})

function KeyboardControllerProviderInner({ children }: { children: React.ReactNode }) {
  const controller = useKeyboardController?.()
  const setEnabled = controller?.setEnabled
  const count = useRef(0)

  const value = useMemo(
    () => ({
      increment: () => {
        count.current++
        setEnabled?.(count.current > 0)
      },
      decrement: () => {
        count.current--
        setEnabled?.(count.current > 0)
      },
    }),
    [setEnabled],
  )

  return (
    <KeyboardControllerRefCountContext.Provider value={value}>{children}</KeyboardControllerRefCountContext.Provider>
  )
}

export function KeyboardControllerProvider({ children }: { children: React.ReactNode }) {
  if (isExpoGo || !KeyboardProvider) {
    return <>{children}</>
  }

  return (
    <KeyboardProvider enabled={false}>
      <KeyboardControllerProviderInner>{children}</KeyboardControllerProviderInner>
    </KeyboardProvider>
  )
}

export function useEnableKeyboardController(enabled: boolean) {
  const { increment, decrement } = useContext(KeyboardControllerRefCountContext)

  useEffect(() => {
    if (!enabled || isExpoGo) return
    increment()
    return () => decrement()
  }, [enabled, increment, decrement])
}

export function KeyboardStickyView({ children, ...props }: ViewProps & { children: React.ReactNode }) {
  if (isExpoGo || !NativeKeyboardStickyView) {
    return <View {...props}>{children}</View>
  }
  return <NativeKeyboardStickyView {...props}>{children}</NativeKeyboardStickyView>
}
