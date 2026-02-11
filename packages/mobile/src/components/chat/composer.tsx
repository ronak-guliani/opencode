import { useState, useCallback, useRef } from "react"
import { View, TextInput, Pressable, Text, StyleSheet, Platform } from "react-native"
import { KeyboardStickyView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { LiquidGlassContainerView, LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass"
import * as Haptics from "expo-haptics"
import { useMessages } from "../../store/messages"
import { useIsSending, useSessionStatus } from "../../api/hooks"
import { ModelPicker, ModelPickerTrigger } from "../model-picker"
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
  const { setComposerH, listRef, isAtEnd } = useChat()
  const prevHeight = useRef(0)
  const [pickerVisible, setPickerVisible] = useState(false)

  const busy = status?.type === "busy"

  const handleSend = useCallback(async () => {
    const content = text.trim()
    if (!content) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setText("")
    await send(sessionId, content)
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true })
    })
  }, [text, sessionId])

  const handleAbort = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    abort(sessionId)
  }, [sessionId])

  const handleLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
    const h = e.nativeEvent.layout.height
    const delta = h - prevHeight.current
    setComposerH(h)
    if (delta > 0 && prevHeight.current > 0 && isAtEnd.value) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true })
      })
    }
    prevHeight.current = h
  }, [])

  const Sticky = KeyboardStickyView as React.ComponentType<{
    offset?: { closed?: number; opened?: number }
    children?: React.ReactNode
  }>

  const sendButton = busy ? (
    <Pressable style={[styles.sendButton, { backgroundColor: theme.colors.error }]} onPress={handleAbort}>
      <Text style={[styles.sendIcon, { color: "#fff" }]}>Stop</Text>
    </Pressable>
  ) : (
    <Pressable
      style={[
        styles.sendButton,
        {
          backgroundColor: text.trim() ? theme.colors.accent : theme.colors.surfaceRaised,
        },
      ]}
      onPress={handleSend}
      disabled={!text.trim() || sending}
    >
      <Text
        style={[
          styles.sendIcon,
          {
            color: text.trim() ? theme.colors.accentText : theme.colors.textTertiary,
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
        <ModelPickerTrigger onPress={() => setPickerVisible(true)} />
        {isLiquidGlassSupported ? (
          <GlassContainer spacing={8} style={styles.glassRow}>
            <Glass interactive style={[styles.glassInput, { borderRadius: theme.radii.lg }]}>
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
            </Glass>
            <Glass interactive style={styles.glassSend}>
              {sendButton}
            </Glass>
          </GlassContainer>
        ) : (
          <View
            style={[
              styles.inputRow,
              {
                backgroundColor: theme.colors.background,
                borderColor: theme.colors.border,
                borderRadius: theme.radii.lg,
              },
            ]}
          >
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
        )}
      </View>
      <ModelPicker visible={pickerVisible} onClose={() => setPickerVisible(false)} />
    </Sticky>
  )
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  glassRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  glassInput: {
    flex: 1,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  glassSend: {
    borderRadius: 16,
    overflow: "hidden",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: 1,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 36,
    maxHeight: 120,
    paddingVertical: Platform.OS === "ios" ? 6 : 4,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  sendIcon: {
    fontSize: 16,
    fontWeight: "700",
  },
})
