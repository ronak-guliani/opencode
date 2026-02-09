import { memo } from "react"
import { View } from "react-native"
import { StyleSheet } from "react-native-unistyles"
import { useParts } from "@/api/hooks"
import { PartView } from "./part"
import type { Message } from "@opencode-ai/sdk/client"

/**
 * Assistant message — renders all parts in sequence.
 * Left-aligned, no bubble background (content renders inline).
 */
export const AssistantMessage = memo(function AssistantMessage({ message }: { message: Message }) {
  const parts = useParts(message.id)

  return (
    <View style={styles.container}>
      {parts.map((part) => (
        <PartView key={part.id} part={part} />
      ))}
    </View>
  )
})

const styles = StyleSheet.create((theme) => ({
  container: {
    marginBottom: theme.spacing.md,
    gap: theme.spacing.xs,
  },
}))
