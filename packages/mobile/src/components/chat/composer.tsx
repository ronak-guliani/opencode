import { useState, useCallback } from "react"
import { View, TextInput, Pressable, StyleSheet, Platform, Alert, type LayoutChangeEvent } from "react-native"
import { KeyboardStickyView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Feather from "@expo/vector-icons/Feather"
import * as Haptics from "expo-haptics"
import { SendMessageError, useMessages } from "../../store/messages"
import { useIsSending, useSessionStatus } from "../../api/hooks"
import { useChat } from "./provider"
import { useTheme } from "../../theme"
import { type TodoSnapshot, TodoPanel } from "./part"
const FeatherIcon = Feather as unknown as React.ComponentType<{ name: string; size: number; color: string }>

type Props = {
  sessionId: string
  liveTodo?: TodoSnapshot | null
}

export function Composer({ sessionId, liveTodo = null }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [text, setText] = useState("")
  const send = useMessages((s) => s.send)
  const abort = useMessages((s) => s.abort)
  const sending = useIsSending(sessionId)
  const status = useSessionStatus(sessionId)
  const { setComposerH } = useChat()

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
    <Pressable style={[styles.sendButton, { backgroundColor: "#fff" }]} onPress={handleAbort} accessibilityLabel="Stop response">
      <FeatherIcon name="square" size={10} color="#111827" />
    </Pressable>
  ) : (
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
    <Sticky offset={{ closed: 0, opened: 0 }}>
      <View
        style={[
          styles.container,
          {
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}
        onLayout={handleLayout}
      >
        <View
          style={[
            styles.composerCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border + "99",
            },
          ]}
        >
          {liveTodo ? (
            <>
              <View style={styles.todoPinnedSection}>
                <TodoPanel snapshot={liveTodo} variant="pinned" live />
              </View>
              <View style={[styles.todoDivider, { borderTopColor: theme.colors.border + "99" }]} />
            </>
          ) : null}
          <View style={styles.inputRow}>
            <TextInput
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
            />
            {sendButton}
          </View>
        </View>
      </View>
    </Sticky>
  )
}

const styles = StyleSheet.create({
  container: {
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
  composerCard: {
    borderWidth: 1,
    borderRadius: 24,
    overflow: "hidden",
  },
  todoPinnedSection: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  todoDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputRow: {
    minHeight: 44,
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
