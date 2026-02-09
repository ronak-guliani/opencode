import { memo } from "react"
import { View, Text } from "react-native"
import { StyleSheet } from "react-native-unistyles"
import { useParts } from "@/api/hooks"
import type { Message } from "@opencode-ai/sdk/client"

/**
 * User message bubble — styled as a right-aligned colored bubble.
 * Shows the text content from the first text part.
 */
export const UserMessage = memo(function UserMessage({ message }: { message: Message }) {
  const parts = useParts(message.id)
  const text = parts.find((p) => p.type === "text")

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={styles.text}>{text?.type === "text" ? text.text : ""}</Text>
      </View>
    </View>
  )
})

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: theme.spacing.md,
  },
  bubble: {
    backgroundColor: theme.colors.userBubble,
    borderRadius: theme.radii.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    maxWidth: "80%",
  },
  text: {
    fontSize: theme.typography.size.md,
    color: theme.colors.userBubbleText,
    lineHeight: theme.typography.size.md * theme.typography.lineHeight.normal,
  },
}))
