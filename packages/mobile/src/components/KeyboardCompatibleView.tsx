import { StyleSheet, type ViewStyle, type StyleProp } from "react-native"
import { KeyboardAvoidingView } from "react-native-keyboard-controller"

interface KeyboardCompatibleViewProps {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  keyboardVerticalOffset?: number
}

export function KeyboardCompatibleView({ children, style, keyboardVerticalOffset = 0 }: KeyboardCompatibleViewProps) {
  // @ts-ignore
  return (
    // @ts-ignore
    <KeyboardAvoidingView
      style={[styles.container, style]}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {/* @ts-ignore */}
      {children}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})
