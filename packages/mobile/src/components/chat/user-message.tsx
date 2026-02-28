import { memo } from "react"
import { View, Text, StyleSheet } from "react-native"
import type { Message, Part } from "@opencode-ai/sdk/client"
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
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")
  const summary = parts.map(partSummary).filter(Boolean).join("\n")

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
        ) : summary ? (
          <Text style={[styles.text, { color: theme.colors.userBubbleText }]}>{summary}</Text>
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
    maxWidth: "75%",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  text: {
    fontSize: 15,
    lineHeight: 24,
  },
})

function partSummary(part: Part) {
  if (part.type === "text") return part.text.trim()
  if (part.type === "reasoning") return part.text.trim()
  if (part.type === "compaction") return part.auto ? "Automatic compaction applied." : "Manual compaction applied."
  if (part.type === "subtask") return part.description.trim()
  if (part.type === "agent") return part.name.trim()
  if (part.type === "retry") return part.error?.data?.message?.trim() || "Retry requested."
  if (part.type === "snapshot") return "Snapshot created."
  if (part.type === "step-start" || part.type === "step-finish") return ""
  if (part.type === "patch") return part.files.length > 0 ? `Updated ${part.files.length} file(s).` : "Patch applied."
  if (part.type === "file") return part.filename || part.source?.path || "Attached file."
  if (part.type === "tool") {
    if ("title" in part.state && part.state.title) return part.state.title
    return part.tool
  }
  return ""
}
