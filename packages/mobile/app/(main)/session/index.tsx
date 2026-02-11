import { useState, useCallback, useRef, useEffect } from "react"
import { View, TextInput, Pressable, Text, StyleSheet, Platform } from "react-native"
import { KeyboardStickyView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { LiquidGlassContainerView, LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass"
import * as Haptics from "expo-haptics"
import { useRouter } from "expo-router"
import { useMessages } from "../../../src/store/messages"
import { useSessions } from "../../../src/store/sessions"
import { ModelPicker, ModelPickerTrigger } from "../../../src/components/model-picker"
import { useTheme } from "../../../src/theme"

export default function SessionIndex() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const sendNew = useMessages((s) => s.sendNew)
  const select = useSessions((s) => s.select)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const inputRef = useRef<TextInput>(null)
  const [pickerVisible, setPickerVisible] = useState(false)

  useEffect(() => {
    select(null)
  }, [select])

  const handleSend = useCallback(async () => {
    const content = text.trim()
    if (!content || sending) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setText("")
    setSending(true)
    try {
      const id = await sendNew(content)
      router.replace(`/(main)/session/${id}`)
    } catch {
      setText(content)
      setSending(false)
    }
  }, [text, sending, sendNew, router])

  const Sticky = KeyboardStickyView as React.ComponentType<{
    offset?: { closed?: number; opened?: number }
    children?: React.ReactNode
  }>

  const sendButton = (
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
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.empty}>
        <Text style={[styles.title, { color: theme.colors.textTertiary }]}>New conversation</Text>
      </View>
      <Sticky offset={{ closed: 0, opened: 0 }}>
        <View
          style={[
            styles.composerContainer,
            {
              backgroundColor: isLiquidGlassSupported ? "transparent" : theme.colors.composerBackground,
              borderTopColor: isLiquidGlassSupported ? "transparent" : theme.colors.composerBorder,
              paddingBottom: Math.max(insets.bottom, 8),
            },
          ]}
        >
          {isLiquidGlassSupported ? (
            <GlassContainer spacing={8} style={styles.glassRow}>
              <Glass interactive style={[styles.glassInput, { borderRadius: theme.radii.lg }]}>
                <View style={styles.inputContent}>
                  <ModelPickerTrigger onPress={() => setPickerVisible(true)} />
                  <TextInput
                    ref={inputRef}
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
                    autoFocus
                  />
                </View>
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
              <View style={styles.inputContent}>
                <ModelPickerTrigger onPress={() => setPickerVisible(true)} />
                <TextInput
                  ref={inputRef}
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
                  autoFocus
                />
              </View>
              {sendButton}
            </View>
          )}
        </View>
      </Sticky>
      <ModelPicker visible={pickerVisible} onClose={() => setPickerVisible(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "500",
  },
  composerContainer: {
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
  inputContent: {
    flex: 1,
  },
  input: {
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
