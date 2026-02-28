import { useState, useCallback, useRef, useEffect } from "react"
import { View, TextInput, Pressable, Text, StyleSheet, Platform, Alert } from "react-native"
import { KeyboardStickyView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { LiquidGlassContainerView, LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass"
import * as Haptics from "expo-haptics"
import { useRouter } from "expo-router"
import { SendMessageError, useMessages } from "../../../src/store/messages"
import { useSessions } from "../../../src/store/sessions"
import { ModelPicker, ModelPickerIconButton } from "../../../src/components/model-picker"
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
  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number } | null>(null)
  const trimmedText = text.trim()

  useEffect(() => {
    select(null)
  }, [select])

  const handleSend = useCallback(async () => {
    const content = text.trim()
    if (!content || sending) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setText("")
    setSending(true)
    try {
      const id = await sendNew(content)
      router.replace(`/(main)/session/${id}`)
    } catch (error) {
      setText(content)
      setSending(false)
      if (error instanceof SendMessageError) {
        Alert.alert("Message failed", "Could not start that conversation. Please try again.")
        return
      }
      Alert.alert("Message failed", "Something went wrong while sending.")
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
  const modelButton = (
    <ModelPickerIconButton
      onPress={(point) => {
        setPickerAnchor(point)
        setPickerVisible(true)
      }}
    />
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
              <Glass interactive style={styles.glassCircle}>
                {modelButton}
              </Glass>
              <Glass interactive style={[styles.glassInput, { borderRadius: 24 }]}>
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
              </Glass>
              <Glass interactive style={styles.glassCircle}>
                {sendButton}
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
              <View style={[styles.fallbackCircle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                {sendButton}
              </View>
            </View>
          )}
        </View>
      </Sticky>
      <ModelPicker visible={pickerVisible} onClose={() => setPickerVisible(false)} anchor={pickerAnchor} />
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
  glassCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  glassInput: {
    flex: 1,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  fallbackRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  fallbackCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    alignItems: "center",
  },
  inputRow: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 24,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  input: {
    fontSize: 15,
    lineHeight: 22,
    minHeight: 30,
    maxHeight: 110,
    paddingVertical: Platform.OS === "ios" ? 4 : 2,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  sendIcon: {
    fontSize: 16,
    fontWeight: "700",
  },
})
