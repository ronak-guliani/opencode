import { StyleSheet, KeyboardAvoidingView, Platform, type ViewStyle, type StyleProp } from "react-native"

interface KeyboardCompatibleViewProps {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  keyboardVerticalOffset?: number
}

export function KeyboardCompatibleView({ children, style, keyboardVerticalOffset = 0 }: KeyboardCompatibleViewProps) {
  return (
    <KeyboardAvoidingView
      style={[styles.container, style]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})
