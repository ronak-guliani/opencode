import { useState, useCallback } from "react"
import { View, TextInput, Pressable, Text, StyleSheet, Platform, Alert, type LayoutChangeEvent } from "react-native"
import { KeyboardStickyView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { LiquidGlassContainerView, LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass"
import * as Haptics from "expo-haptics"
import { SendMessageError, useMessages } from "../../store/messages"
import { useIsSending, useSessionStatus } from "../../api/hooks"
import { ModelPicker, ModelPickerIconButton } from "../model-picker"
import { useChat } from "./provider"
import { useTheme } from "../../theme"

type Props = {
  sessionId: string
}

export function Composer({ sessionId }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [text, setText] = useState("")
  const send = useMessages((s) => s.send)
  const abort = useMessages((s) => s.abort)
  const sending = useIsSending(sessionId)
  const status = useSessionStatus(sessionId)
  const { setComposerH } = useChat()
  const [pickerVisible, setPickerVisible] = useState(false)
  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number } | null>(null)

  const busy = status?.type === "busy"
  const trimmedText = text.trim()

  const handleSend = useCallback(async () => {
    const content = text.trim()
    if (!content || sending || busy) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setText("")
    try {
      await send(sessionId, content)
    } catch (error) {
      setText(content)
      if (error instanceof SendMessageError) {
        Alert.alert("Message failed", "Could not send your message. Please try again.")
        return
      }
      Alert.alert("Message failed", "Something went wrong while sending.")
    }
  }, [busy, text, sending, sessionId, send])

  const handleAbort = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    abort(sessionId)
  }, [sessionId, abort])

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setComposerH(Math.round(e.nativeEvent.layout.height))
  }, [setComposerH])

  const Sticky = KeyboardStickyView as React.ComponentType<{
    offset?: { closed?: number; opened?: number }
    children?: React.ReactNode
  }>

  const sendButton = busy ? (
    <Pressable style={[styles.sendButton, { backgroundColor: theme.colors.error }]} onPress={handleAbort}>
      <Text style={[styles.sendIcon, { color: "#fff" }]}>{"\u25A0"}</Text>
    </Pressable>
  ) : (
    <Pressable
      style={[
        styles.sendButton,
        {
          backgroundColor: trimmedText ? theme.colors.accent : theme.colors.surfaceRaised,
        },
      ]}
      onPress={handleSend}
      disabled={!trimmedText || sending}
    >
      <Text
        style={[
          styles.sendIcon,
          {
            color: trimmedText ? theme.colors.accentText : theme.colors.textTertiary,
          },
        ]}
      >
        {"\u2191"}
      </Text>
    </Pressable>
  )

  const GlassContainer = LiquidGlassContainerView as React.ComponentType<{
    spacing?: number
    style?: unknown
    children?: React.ReactNode
  }>
  const Glass = LiquidGlassView as React.ComponentType<{
    interactive?: boolean
    style?: unknown
    children?: React.ReactNode
  }>

  const modelButton = (
    <ModelPickerIconButton
      onPress={(point) => {
        setPickerAnchor(point)
        setPickerVisible(true)
      }}
    />
  )

  return (
    <Sticky offset={{ closed: 0, opened: 0 }}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: isLiquidGlassSupported ? "transparent" : theme.colors.composerBackground,
            borderTopColor: isLiquidGlassSupported ? "transparent" : theme.colors.composerBorder,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}
        onLayout={handleLayout}
      >
        {isLiquidGlassSupported ? (
          <GlassContainer spacing={8} style={styles.glassRow}>
            <Glass interactive style={styles.glassCircle}>
              {modelButton}
            </Glass>
            <Glass interactive style={[styles.glassInput, { borderRadius: 21 }]}>
              <View style={styles.inputShell}>
                <TextInput
                  style={[styles.input, { color: theme.colors.text }]}
                  value={text}
                  onChangeText={setText}
                  placeholder="Send a message..."
                  placeholderTextColor={theme.colors.textTertiary}
                  multiline
                  maxLength={100000}
                  editable={!sending}
                  returnKeyType="default"
                  blurOnSubmit={false}
                />
                {sendButton}
              </View>
            </Glass>
          </GlassContainer>
        ) : (
          <View style={styles.fallbackRow}>
            <View style={[styles.fallbackCircle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              {modelButton}
            </View>
            <View
              style={[
                styles.inputRow,
                {
                  backgroundColor: theme.colors.background,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.inputShell}>
                <TextInput
                  style={[styles.input, { color: theme.colors.text }]}
                  value={text}
                  onChangeText={setText}
                  placeholder="Send a message..."
                  placeholderTextColor={theme.colors.textTertiary}
                  multiline
                  maxLength={100000}
                  editable={!sending}
                  returnKeyType="default"
                  blurOnSubmit={false}
                />
                {sendButton}
              </View>
            </View>
          </View>
        )}
      </View>
      <ModelPicker visible={pickerVisible} onClose={() => setPickerVisible(false)} anchor={pickerAnchor} />
    </Sticky>
  )
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  glassRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  glassCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  glassInput: {
    flex: 1,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: "hidden",
  },
  fallbackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fallbackCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    alignItems: "center",
  },
  inputRow: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 21,
    justifyContent: "center",
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  inputShell: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    paddingRight: 2,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 23,
    minHeight: 26,
    maxHeight: 96,
    paddingVertical: Platform.OS === "ios" ? 5 : 3,
    paddingRight: 8,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  sendIcon: {
    fontSize: 14,
    fontWeight: "700",
  },
})
