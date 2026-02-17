import { memo } from "react"
import { View, Text, StyleSheet } from "react-native"
import type { Message } from "@opencode-ai/sdk/client"
import { useMessageParts } from "../../api/hooks"
import { useTheme } from "../../theme"
import { PartRenderer } from "./part"

type Props = {
  message: Message
}

export const UserMessage = memo(function UserMessage({ message }: Props) {
  const theme = useTheme()
  const parts = useMessageParts(message.id)

  const text = parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("")

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: theme.colors.userBubble,
            borderRadius: theme.radii.lg,
          },
        ]}
      >
        {text ? (
          <Text style={[styles.text, { color: theme.colors.userBubbleText }]}>{text}</Text>
        ) : (
          parts.map((part) => <PartRenderer key={part.id} part={part} isUser />)
        )}
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-end",
    marginBottom: 12,
  },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  text: {
    fontSize: 15,
    lineHeight: 23,
  },
})
