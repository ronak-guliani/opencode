import { useState, useRef, useCallback } from "react"
import { View, TextInput, Pressable, Text, type ViewStyle, type StyleProp } from "react-native"
import { StyleSheet } from "react-native-unistyles"
import { router } from "expo-router"
import { getClient } from "@/api/client"
import { useSessionStore } from "@/store/sessions"
import { useSessionStatus } from "@/api/hooks"

/**
 * Floating composer — text input with send button.
 * Handles both new session creation and sending to existing sessions.
 *
 * When sessionId is provided, sends to that session.
 * When omitted (empty state), creates a new session first.
 */
export function Composer({ sessionId, style }: { sessionId?: string; style?: StyleProp<ViewStyle> }) {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const input = useRef<TextInput>(null)
  const status = useSessionStatus(sessionId ?? "")
  const busy = status?.type === "busy"

  const send = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    setSending(true)
    setText("")

    try {
      const client = getClient()

      if (sessionId) {
        await client.session.promptAsync({
          path: { id: sessionId },
          body: { parts: [{ type: "text", text: trimmed }] },
        })
      } else {
        // Create new session then send
        const res = await client.session.create()
        if (!res.data) return

        const id = res.data.id
        useSessionStore.getState().upsert(res.data)

        await client.session.promptAsync({
          path: { id },
          body: { parts: [{ type: "text", text: trimmed }] },
        })

        router.push(`/(main)/session/${id}`)
      }
    } catch (err) {
      console.error("[composer] Send failed:", err)
      // Restore text on failure
      setText(trimmed)
    } finally {
      setSending(false)
    }
  }, [text, sending, sessionId])

  return (
    <View style={[styles.container, style]}>
      <View style={styles.inputRow}>
        <TextInput
          ref={input}
          style={styles.input}
          placeholder={busy ? "Waiting for response..." : "Ask anything..."}
          placeholderTextColor="#71717a"
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          multiline
          maxLength={10000}
          editable={!sending && !busy}
          returnKeyType="send"
          blurOnSubmit
        />
        <Pressable
          style={({ pressed }) => [
            styles.send,
            (!text.trim() || sending || busy) && styles.sendDisabled,
            pressed && styles.sendPressed,
          ]}
          onPress={send}
          disabled={!text.trim() || sending || busy}
        >
          <Text style={styles.sendText}>↑</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create((theme) => ({
  container: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: theme.typography.size.md,
    color: theme.colors.text,
    maxHeight: 120,
    paddingVertical: theme.spacing.xs,
  },
  send: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  sendDisabled: {
    backgroundColor: theme.colors.surfaceRaised,
  },
  sendPressed: {
    opacity: 0.85,
  },
  sendText: {
    color: theme.colors.accentText,
    fontSize: theme.typography.size.lg,
    fontWeight: theme.typography.weight.bold,
  },
}))
