import { useState, useCallback, useRef, useEffect } from "react"
import { View, TextInput, Pressable, Text, StyleSheet, Platform, Alert } from "react-native"
import { KeyboardStickyView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Feather from "@expo/vector-icons/Feather"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import * as Haptics from "expo-haptics"
import { useRouter } from "expo-router"
import { SendMessageError, useMessages } from "../../../src/store/messages"
import { useSessions } from "../../../src/store/sessions"
import { useSettings, modelName } from "../../../src/store/settings"
import { ModelPicker } from "../../../src/components/model-picker"
import { useTheme } from "../../../src/theme"

const FeatherIcon = Feather as unknown as React.ComponentType<{ name: string; size: number; color: string }>
const MaterialIcon = MaterialCommunityIcons as unknown as React.ComponentType<{ name: string; size: number; color: string; style?: unknown }>

export default function SessionIndex() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const sendNew = useMessages((s) => s.sendNew)
  const select = useSessions((s) => s.select)
  const activeModel = useSettings(modelName)
  const fetchProviders = useSettings((s) => s.fetchProviders)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const inputRef = useRef<TextInput>(null)
  const [pickerVisible, setPickerVisible] = useState(false)
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

  const openModelPicker = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void fetchProviders()
    setPickerVisible(true)
  }, [fetchProviders])

  const resetDraft = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setText("")
    inputRef.current?.focus()
  }, [])

  const openOptions = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Alert.alert("Conversation options", "More options are coming soon.", [{ text: "Close", style: "cancel" }])
  }, [])

  const Sticky = KeyboardStickyView as React.ComponentType<{
    offset?: { closed?: number; opened?: number }
    children?: React.ReactNode
  }>

  const sendButton = (
    <Pressable
      style={[
        styles.sendButton,
        {
          backgroundColor: trimmedText ? "#fff" : theme.colors.surfaceRaised,
        },
      ]}
      onPress={handleSend}
      disabled={!trimmedText || sending}
      accessibilityLabel="Send message"
    >
      <FeatherIcon name="arrow-up" size={14} color={trimmedText ? "#111827" : theme.colors.textTertiary} />
    </Pressable>
  )

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 12,
            backgroundColor: theme.colors.background,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Pressable
            style={({ pressed }) => [
              styles.modelButton,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
              pressed && styles.iconButtonPressed,
            ]}
            onPress={openModelPicker}
            accessibilityRole="button"
            accessibilityLabel="Choose model"
          >
            <Text style={[styles.modelLabel, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
              {activeModel}
            </Text>
            <FeatherIcon name="chevron-right" size={13} color={theme.colors.textSecondary} />
          </Pressable>

          <View style={styles.titleSlot}>
            <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
              New conversation
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              onPress={resetDraft}
              accessibilityRole="button"
              accessibilityLabel="New session"
              hitSlop={8}
            >
              <MaterialIcon style={styles.composeSymbol} name="square-edit-outline" size={18} color={theme.colors.text} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              onPress={openOptions}
              accessibilityRole="button"
              accessibilityLabel="Session options"
              hitSlop={8}
            >
              <FeatherIcon name="more-horizontal" size={18} color={theme.colors.text} />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.empty}>
        <Text style={[styles.emptyTitle, { color: theme.colors.textSecondary }]}>Start a new chat</Text>
      </View>

      <Sticky offset={{ closed: 0, opened: 0 }}>
        <View
          style={[
            styles.composerContainer,
            {
              paddingBottom: Math.max(insets.bottom, 8),
            },
          ]}
        >
          <View
            style={[
              styles.inputRow,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border + "99",
              },
            ]}
          >
            <TextInput
              ref={inputRef}
              style={[styles.input, { color: theme.colors.text }]}
              value={text}
              onChangeText={setText}
              placeholder="Ask anything"
              placeholderTextColor={theme.colors.textTertiary}
              multiline
              maxLength={100000}
              editable={!sending}
              returnKeyType="default"
              blurOnSubmit={false}
              autoFocus
            />
            {sendButton}
          </View>
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
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
    gap: 7,
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonPressed: {
    opacity: 0.55,
  },
  composeSymbol: {
    marginTop: 0.5,
  },
  modelButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    minHeight: 26,
    maxWidth: 220,
    paddingHorizontal: 7,
    flexShrink: 1,
  },
  modelLabel: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },
  titleSlot: {
    flex: 1,
    justifyContent: "center",
    paddingRight: 2,
  },
  title: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "500",
    textAlign: "left",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "500",
  },
  composerContainer: {
    paddingHorizontal: 10,
    paddingTop: 6,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  inputRow: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "flex-end",
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 3,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    minHeight: 26,
    maxHeight: 104,
    paddingTop: Platform.OS === "ios" ? 7 : 4,
    paddingBottom: Platform.OS === "ios" ? 7 : 4,
    paddingRight: 8,
  },
  sendButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
})
