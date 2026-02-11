import { memo } from "react"
import { View, Text, StyleSheet } from "react-native"
import type { Message } from "@opencode-ai/sdk/client"
import { useMessageParts } from "../../api/hooks"
import { useTheme } from "../../theme"
import { FadeInStaggered } from "../../animation"
import { PartRenderer } from "./part"

type Props = {
  message: Message
  index: number
}

export const AssistantMessage = memo(function AssistantMessage({ message }: Props) {
  const theme = useTheme()
  const parts = useMessageParts(message.id)

  if (parts.length === 0) return null

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {parts.map((part) => (
          <FadeInStaggered key={part.id}>
            <PartRenderer part={part} isUser={false} />
          </FadeInStaggered>
        ))}
      </View>
      {"tokens" in message && message.tokens && (
        <Text style={[styles.meta, { color: theme.colors.textTertiary }]}>
          {message.tokens.input + message.tokens.output > 0 &&
            `${formatTokens(message.tokens.input + message.tokens.output)} tokens`}
        </Text>
      )}
    </View>
  )
})

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`
  return `${(n / 1000).toFixed(1)}k`
}

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-start",
    marginBottom: 12,
  },
  content: {
    width: "100%",
  },
  meta: {
    fontSize: 11,
    marginTop: 4,
    marginLeft: 2,
  },
})
