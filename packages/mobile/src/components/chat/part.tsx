import { memo, useState, useCallback } from "react"
import { View, Text, Pressable, StyleSheet, LayoutAnimation } from "react-native"
import type { Part, TextPart, ToolPart } from "@opencode-ai/sdk/client"
import { useTheme } from "../../theme"
import { MarkdownRenderer } from "../markdown/renderer"

type Props = {
  part: Part
  isUser: boolean
}

export const PartRenderer = memo(function PartRenderer({ part, isUser }: Props) {
  switch (part.type) {
    case "text":
      return <TextPartView part={part} isUser={isUser} />
    case "tool":
      return <ToolPartView part={part} />
    case "step-start":
    case "step-finish":
    case "snapshot":
    case "patch":
    case "compaction":
      return null
    default:
      return null
  }
})

function TextPartView({ part, isUser }: { part: TextPart; isUser: boolean }) {
  const theme = useTheme()
  if (!part.text) return null

  if (isUser) {
    return <Text style={[styles.text, { color: theme.colors.userBubbleText }]}>{part.text}</Text>
  }

  return <MarkdownRenderer>{part.text}</MarkdownRenderer>
}

function ToolPartView({ part }: { part: ToolPart }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)
  const status = part.state.status
  const title = "title" in part.state ? part.state.title : part.tool

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setExpanded((v) => !v)
  }, [])

  const dot =
    status === "completed"
      ? theme.colors.success
      : status === "error"
        ? theme.colors.error
        : status === "running"
          ? theme.colors.warning
          : theme.colors.textTertiary

  const elapsed =
    "time" in part.state && part.state.time
      ? "end" in part.state.time && part.state.time.end
        ? `${((part.state.time.end - part.state.time.start) / 1000).toFixed(1)}s`
        : null
      : null

  return (
    <Pressable
      onPress={toggle}
      style={[
        styles.tool,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
        },
      ]}
    >
      <View style={styles.toolHeader}>
        <View style={[styles.statusDot, { backgroundColor: dot }]} />
        <Text style={[styles.toolName, { color: theme.colors.text }]} numberOfLines={expanded ? undefined : 1}>
          {title || part.tool}
        </Text>
        {elapsed && <Text style={[styles.elapsed, { color: theme.colors.textTertiary }]}>{elapsed}</Text>}
        <Text style={[styles.chevron, { color: theme.colors.textTertiary }]}>{expanded ? "\u25B4" : "\u25BE"}</Text>
      </View>

      {expanded && (
        <View style={[styles.toolBody, { borderTopColor: theme.colors.border }]}>
          {"input" in part.state && part.state.input && Object.keys(part.state.input).length > 0 && (
            <View style={styles.toolSection}>
              <Text style={[styles.toolLabel, { color: theme.colors.textTertiary }]}>Input</Text>
              <Text
                style={[
                  styles.toolCode,
                  { color: theme.colors.codeText, backgroundColor: theme.colors.codeBackground },
                ]}
                selectable
              >
                {formatInput(part.state.input)}
              </Text>
            </View>
          )}

          {status === "completed" && "output" in part.state && part.state.output && (
            <View style={styles.toolSection}>
              <Text style={[styles.toolLabel, { color: theme.colors.textTertiary }]}>Output</Text>
              <Text
                style={[
                  styles.toolCode,
                  { color: theme.colors.codeText, backgroundColor: theme.colors.codeBackground },
                ]}
                selectable
                numberOfLines={20}
              >
                {part.state.output.length > 2000 ? part.state.output.slice(0, 2000) + "\n..." : part.state.output}
              </Text>
            </View>
          )}

          {status === "error" && "error" in part.state && (
            <View style={styles.toolSection}>
              <Text style={[styles.toolLabel, { color: theme.colors.error }]}>Error</Text>
              <Text style={[styles.toolError, { color: theme.colors.error }]} selectable>
                {part.state.error}
              </Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  )
}

function formatInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input)
  if (entries.length === 0) return ""
  if (entries.length === 1) {
    const [key, val] = entries[0]
    if (typeof val === "string") return val.length > 500 ? val.slice(0, 500) + "..." : val
    return JSON.stringify(val, null, 2)
  }
  return JSON.stringify(input, null, 2)
}

const styles = StyleSheet.create({
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  tool: {
    borderWidth: 1,
    marginVertical: 4,
    overflow: "hidden",
  },
  toolHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  toolName: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  elapsed: {
    fontSize: 11,
  },
  chevron: {
    fontSize: 10,
  },
  toolBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  toolSection: {
    gap: 4,
  },
  toolLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  toolCode: {
    fontFamily: "Geist Mono",
    fontSize: 12,
    lineHeight: 17,
    padding: 8,
    borderRadius: 6,
    overflow: "hidden",
  },
  toolError: {
    fontSize: 13,
    lineHeight: 18,
  },
})
