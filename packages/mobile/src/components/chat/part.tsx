import { memo } from "react"
import { View, Text } from "react-native"
import { StyleSheet } from "react-native-unistyles"
import type { Part } from "@opencode-ai/sdk/client"
import { tokens, cost } from "@/util/format"

/**
 * Part renderer — dispatches on part.type to render the appropriate view.
 *
 * Phase 1 renders: text, tool (summary), step-finish (token summary).
 * Other part types show a minimal fallback.
 */
export const PartView = memo(function PartView({ part }: { part: Part }) {
  switch (part.type) {
    case "text":
      return <TextPartView text={part.text} />
    case "tool":
      return <ToolPartView part={part} />
    case "step-finish":
      return <StepFinishView part={part} />
    default:
      return null
  }
})

function TextPartView({ text }: { text: string }) {
  if (!text) return null
  return <Text style={styles.text}>{text}</Text>
}

function ToolPartView({ part }: { part: Extract<Part, { type: "tool" }> }) {
  const title =
    part.state.status === "running" || part.state.status === "completed" || part.state.status === "error"
      ? (part.state.title ?? part.tool)
      : part.tool

  const running = part.state.status === "pending" || part.state.status === "running"
  const error = part.state.status === "error"

  return (
    <View style={[styles.tool, error && styles.toolError]}>
      <Text style={styles.toolIcon}>{running ? "⏳" : error ? "✗" : "✓"}</Text>
      <Text style={[styles.toolTitle, error && styles.toolTitleError]} numberOfLines={1}>
        {title}
      </Text>
    </View>
  )
}

function StepFinishView({ part }: { part: Extract<Part, { type: "step-finish" }> }) {
  const total = part.tokens.input + part.tokens.output
  if (total === 0) return null

  return (
    <View style={styles.step}>
      <Text style={styles.stepText}>
        {tokens(total)} tokens · {cost(part.cost)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create((theme) => ({
  text: {
    fontSize: theme.typography.size.md,
    color: theme.colors.text,
    lineHeight: theme.typography.size.md * theme.typography.lineHeight.relaxed,
  },
  tool: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  toolError: {
    borderColor: theme.colors.error,
  },
  toolIcon: {
    fontSize: theme.typography.size.sm,
  },
  toolTitle: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.text,
    flex: 1,
  },
  toolTitleError: {
    color: theme.colors.error,
  },
  step: {
    paddingVertical: theme.spacing.xs,
  },
  stepText: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textTertiary,
  },
}))
