import { memo, useState, useCallback, useEffect } from "react"
import { View, Text, Pressable, StyleSheet, Linking } from "react-native"
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import type {
  AgentPart,
  FilePart,
  Part,
  PatchPart,
  ReasoningPart,
  RetryPart,
  SnapshotPart,
  TextPart,
  ToolPart,
} from "@opencode-ai/sdk/client"
import { useTheme } from "../../theme"
import { MarkdownRenderer } from "../markdown/renderer"

type SubtaskPart = Extract<Part, { type: "subtask" }>
type CompactionPart = Extract<Part, { type: "compaction" }>

const AnimatedView = Animated.View as any
const AnimatedText = Animated.Text as any
const COLLAPSIBLE_LAYOUT = LinearTransition.springify().damping(22).stiffness(260).mass(0.7)
const COLLAPSIBLE_ENTER = FadeIn.duration(140).easing(Easing.out(Easing.cubic))
const COLLAPSIBLE_EXIT = FadeOut.duration(110).easing(Easing.in(Easing.cubic))

type Props = {
  part: Part
  isUser: boolean
  onHydrateMessage?: (messageID: string) => void
}

export const PartRenderer = memo(function PartRenderer({ part, isUser, onHydrateMessage }: Props) {
  switch (part.type) {
    case "text":
      return <TextPartView part={part} isUser={isUser} />
    case "reasoning":
      return <ReasoningPartView part={part} />
    case "tool":
      return <ToolPartView part={part} onHydrateMessage={onHydrateMessage} />
    case "file":
      return <FilePartView part={part} />
    case "step-start":
      return null
    case "step-finish":
      return null
    case "snapshot":
      return <SnapshotPartView part={part} />
    case "patch":
      return <PatchPartView part={part} />
    case "agent":
      return <AgentPartView part={part} />
    case "retry":
      return <RetryPartView part={part} />
    case "subtask":
      return <SubtaskPartView part={part} />
    case "compaction":
      return <CompactionPartView part={part} />
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

function ReasoningPartView({ part }: { part: ReasoningPart }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)
  const text = part.text?.trim()
  if (!text) return null

  const toggle = useCallback(() => {
    setExpanded((v) => !v)
  }, [])

  const label = `Thought about ${summarizeInline(text, 52)}`

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <Pressable style={styles.collapsibleRow} onPress={toggle}>
        <Text style={[styles.collapsibleLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          {label}
        </Text>
        <CollapsibleChevron expanded={expanded} color={theme.colors.textTertiary} />
      </Pressable>
      {expanded ? (
        <AnimatedView
          entering={COLLAPSIBLE_ENTER}
          exiting={COLLAPSIBLE_EXIT}
          layout={COLLAPSIBLE_LAYOUT}
          style={styles.reasoningExpanded}
        >
          <MarkdownRenderer variant="reasoning">{text}</MarkdownRenderer>
        </AnimatedView>
      ) : null}
    </AnimatedView>
  )
}

function ToolPartView({ part, onHydrateMessage }: { part: ToolPart; onHydrateMessage?: (messageID: string) => void }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)
  const status = part.state.status
  const title = "title" in part.state ? part.state.title : part.tool
  const requestHydration = useCallback(() => {
    if (!onHydrateMessage) return
    onHydrateMessage(part.messageID)
  }, [onHydrateMessage, part.messageID])

  const toggle = useCallback(() => {
    const opening = !expanded
    if (
      opening &&
      status === "completed" &&
      "outputTruncated" in part.state &&
      part.state.outputTruncated
    ) {
      requestHydration()
    }
    setExpanded((v) => !v)
  }, [expanded, part.state, requestHydration, status])

  const summary = summarizeToolLabel(part, title || part.tool)
  const elapsed = toolElapsed(part)
  const truncatedOutput =
    status === "completed" && "outputTruncated" in part.state && typeof part.state.outputTruncated === "boolean"
      ? part.state.outputTruncated
      : false

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <Pressable style={styles.collapsibleRow} onPress={toggle}>
        <Text style={[styles.collapsibleLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          {summary}
        </Text>
        <CollapsibleChevron expanded={expanded} color={theme.colors.textTertiary} />
      </Pressable>
      {expanded && (
        <AnimatedView
          entering={COLLAPSIBLE_ENTER}
          exiting={COLLAPSIBLE_EXIT}
          layout={COLLAPSIBLE_LAYOUT}
          style={[
            styles.toolExpanded,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.borderSubtle,
            },
          ]}
        >
          <Text style={[styles.toolMeta, { color: theme.colors.textTertiary }]}>
            {(title || part.tool) + (elapsed ? ` · ${elapsed}` : "")}
          </Text>
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
              {truncatedOutput && (
                <Pressable onPress={requestHydration} style={styles.truncatedHintWrap}>
                  <Text style={[styles.truncatedHint, { color: theme.colors.link }]}>Tap to load full output</Text>
                </Pressable>
              )}
            </View>
          )}

          {status === "completed" &&
            "attachments" in part.state &&
            Array.isArray(part.state.attachments) &&
            part.state.attachments.length > 0 && (
              <View style={styles.toolSection}>
                <Text style={[styles.toolLabel, { color: theme.colors.textTertiary }]}>Attachments</Text>
                {part.state.attachments.map((attachment) => (
                  <Pressable
                    key={attachment.id}
                    onPress={() => Linking.openURL(attachment.url).catch(() => {})}
                    style={[styles.attachment, { borderColor: theme.colors.border }]}
                  >
                    <Text style={[styles.attachmentText, { color: theme.colors.link }]} numberOfLines={1}>
                      {attachment.filename || attachment.source?.path || attachment.url}
                    </Text>
                  </Pressable>
                ))}
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
        </AnimatedView>
      )}
    </AnimatedView>
  )
}

function FilePartView({ part }: { part: FilePart }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)
  const name = part.filename || part.source?.path?.split("/").pop() || "Attached file"
  const sourceLabel = part.source
    ? part.source.type === "symbol"
      ? `${part.source.path} · ${part.source.name}`
      : part.source.path
    : part.mime

  const toggle = useCallback(() => {
    setExpanded((v) => !v)
  }, [])

  const label = `Created ${summarizeInline(name, 52)}`

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <Pressable style={styles.collapsibleRow} onPress={toggle}>
        <Text style={[styles.collapsibleLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          {label}
        </Text>
        <CollapsibleChevron expanded={expanded} color={theme.colors.textTertiary} />
      </Pressable>
      {expanded ? (
        <AnimatedView
          entering={COLLAPSIBLE_ENTER}
          exiting={COLLAPSIBLE_EXIT}
          layout={COLLAPSIBLE_LAYOUT}
          style={[styles.expandedPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderSubtle }]}
        >
          <Text style={[styles.infoBody, { color: theme.colors.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.infoSubtle, { color: theme.colors.textTertiary }]} numberOfLines={1}>
            {sourceLabel}
          </Text>
          {part.source?.text?.value ? (
            <Text
              style={[
                styles.infoCode,
                {
                  backgroundColor: theme.colors.codeBackground,
                  color: theme.colors.codeText,
                },
              ]}
              numberOfLines={8}
            >
              {part.source.text.value}
            </Text>
          ) : null}
          <Pressable onPress={() => Linking.openURL(part.url).catch(() => {})}>
            <Text style={[styles.infoLink, { color: theme.colors.link }]}>Open attachment</Text>
          </Pressable>
        </AnimatedView>
      ) : null}
    </AnimatedView>
  )
}

function SnapshotPartView({ part }: { part: SnapshotPart }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)

  const toggle = useCallback(() => {
    setExpanded((v) => !v)
  }, [])

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <Pressable style={styles.collapsibleRow} onPress={toggle}>
        <Text style={[styles.collapsibleLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          Created snapshot
        </Text>
        <CollapsibleChevron expanded={expanded} color={theme.colors.textTertiary} />
      </Pressable>
      {expanded ? (
        <AnimatedView
          entering={COLLAPSIBLE_ENTER}
          exiting={COLLAPSIBLE_EXIT}
          layout={COLLAPSIBLE_LAYOUT}
          style={[styles.expandedPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderSubtle }]}
        >
          <Text style={[styles.infoBody, { color: theme.colors.textSecondary }]}>{short(part.snapshot)}</Text>
        </AnimatedView>
      ) : null}
    </AnimatedView>
  )
}

function PatchPartView({ part }: { part: PatchPart }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)
  const visible = part.files.slice(0, 8)
  const remaining = Math.max(0, part.files.length - visible.length)
  const label = `Created ${part.files.length} file ${part.files.length === 1 ? "change" : "changes"}`

  const toggle = useCallback(() => {
    setExpanded((v) => !v)
  }, [])

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <Pressable style={styles.collapsibleRow} onPress={toggle}>
        <Text style={[styles.collapsibleLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          {label}
        </Text>
        <CollapsibleChevron expanded={expanded} color={theme.colors.textTertiary} />
      </Pressable>
      {expanded ? (
        <AnimatedView
          entering={COLLAPSIBLE_ENTER}
          exiting={COLLAPSIBLE_EXIT}
          layout={COLLAPSIBLE_LAYOUT}
          style={[styles.expandedPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderSubtle }]}
        >
          <Text style={[styles.infoBody, { color: theme.colors.textSecondary }]}>
            {part.files.length} file{part.files.length === 1 ? "" : "s"} changed
          </Text>
          {visible.map((file) => (
            <Text key={`${part.id}:${file}`} style={[styles.infoPath, { color: theme.colors.text }]} numberOfLines={1}>
              {file}
            </Text>
          ))}
          {remaining > 0 && (
            <Text style={[styles.infoSubtle, { color: theme.colors.textTertiary }]}>
              +{remaining} more file{remaining === 1 ? "" : "s"}
            </Text>
          )}
        </AnimatedView>
      ) : null}
    </AnimatedView>
  )
}

function AgentPartView({ part }: { part: AgentPart }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)

  const toggle = useCallback(() => {
    setExpanded((v) => !v)
  }, [])

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <Pressable style={styles.collapsibleRow} onPress={toggle}>
        <Text style={[styles.collapsibleLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          {`Thought about using ${summarizeInline(part.name, 46)}`}
        </Text>
        <CollapsibleChevron expanded={expanded} color={theme.colors.textTertiary} />
      </Pressable>
      {expanded ? (
        <AnimatedView
          entering={COLLAPSIBLE_ENTER}
          exiting={COLLAPSIBLE_EXIT}
          layout={COLLAPSIBLE_LAYOUT}
          style={[styles.expandedPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderSubtle }]}
        >
          <Text style={[styles.infoBody, { color: theme.colors.textSecondary }]}>{part.name}</Text>
        </AnimatedView>
      ) : null}
    </AnimatedView>
  )
}

function RetryPartView({ part }: { part: RetryPart }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)
  const error = part.error?.data?.message || "Unknown error"

  const toggle = useCallback(() => {
    setExpanded((v) => !v)
  }, [])

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <Pressable style={styles.collapsibleRow} onPress={toggle}>
        <Text style={[styles.collapsibleLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          {`Thought about retry #${part.attempt}`}
        </Text>
        <CollapsibleChevron expanded={expanded} color={theme.colors.textTertiary} />
      </Pressable>
      {expanded ? (
        <AnimatedView
          entering={COLLAPSIBLE_ENTER}
          exiting={COLLAPSIBLE_EXIT}
          layout={COLLAPSIBLE_LAYOUT}
          style={[styles.expandedPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderSubtle }]}
        >
          <Text style={[styles.infoBody, { color: theme.colors.textSecondary }]}>{error}</Text>
        </AnimatedView>
      ) : null}
    </AnimatedView>
  )
}

function SubtaskPartView({ part }: { part: SubtaskPart }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)

  const toggle = useCallback(() => {
    setExpanded((v) => !v)
  }, [])

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <Pressable style={styles.collapsibleRow} onPress={toggle}>
        <Text style={[styles.collapsibleLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          {`Thought about ${summarizeInline(part.description, 52)}`}
        </Text>
        <CollapsibleChevron expanded={expanded} color={theme.colors.textTertiary} />
      </Pressable>
      {expanded ? (
        <AnimatedView
          entering={COLLAPSIBLE_ENTER}
          exiting={COLLAPSIBLE_EXIT}
          layout={COLLAPSIBLE_LAYOUT}
          style={[styles.expandedPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderSubtle }]}
        >
          <Text style={[styles.infoBody, { color: theme.colors.textSecondary }]}>{part.description}</Text>
          {part.prompt ? <MarkdownRenderer>{part.prompt}</MarkdownRenderer> : null}
          <Text style={[styles.infoSubtle, { color: theme.colors.textTertiary }]}>Agent: {part.agent}</Text>
        </AnimatedView>
      ) : null}
    </AnimatedView>
  )
}

function CompactionPartView({ part }: { part: CompactionPart }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)

  const toggle = useCallback(() => {
    setExpanded((v) => !v)
  }, [])

  const detail = part.auto ? "Automatic compaction applied." : "Manual compaction applied."

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <Pressable style={styles.collapsibleRow} onPress={toggle}>
        <Text style={[styles.collapsibleLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          Thought about context compaction
        </Text>
        <CollapsibleChevron expanded={expanded} color={theme.colors.textTertiary} />
      </Pressable>
      {expanded ? (
        <AnimatedView
          entering={COLLAPSIBLE_ENTER}
          exiting={COLLAPSIBLE_EXIT}
          layout={COLLAPSIBLE_LAYOUT}
          style={[styles.expandedPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderSubtle }]}
        >
          <Text style={[styles.infoBody, { color: theme.colors.textSecondary }]}>{detail}</Text>
        </AnimatedView>
      ) : null}
    </AnimatedView>
  )
}

function CollapsibleChevron({ expanded, color }: { expanded: boolean; color: string }) {
  const progress = useSharedValue(expanded ? 1 : 0)

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, {
      duration: 170,
      easing: Easing.out(Easing.cubic),
    })
  }, [expanded, progress])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 90}deg` }],
  }))

  return (
    <AnimatedText style={[styles.collapsibleChevron, { color }, animatedStyle]}>{">"}</AnimatedText>
  )
}

function short(value: string) {
  if (value.length <= 32) return value
  return `${value.slice(0, 16)}...${value.slice(-8)}`
}

function summarizeInline(value: string, maxChars = 56) {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (!normalized) return "the next step"
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`
}

function isCreateTool(tool: string, title: string) {
  const normalizedTool = tool.toLowerCase()
  const normalizedTitle = title.toLowerCase()
  return (
    /(write|edit|patch|create|mkdir|mv|cp|save)/.test(normalizedTool) ||
    /^(created?|updated?|edited?|wrote|saved)\b/.test(normalizedTitle)
  )
}

function defaultToolSubject(tool: string) {
  const normalized = tool.toLowerCase()
  if (normalized.includes("glob")) return "files in the project"
  if (normalized.includes("bash") || normalized.includes("shell") || normalized.includes("command")) return "a command"
  if (normalized.includes("grep") || normalized.includes("find") || normalized.includes("search")) return "relevant matches"
  if (normalized.includes("read") || normalized.includes("cat")) return "file contents"
  if (normalized.includes("patch") || normalized.includes("edit") || normalized.includes("write")) return "project changes"
  return tool
}

function summarizeToolLabel(part: ToolPart, title: string) {
  const normalizedTitle = title.replace(/\s+/g, " ").trim()
  const shouldUseTitle = normalizedTitle.length > 0 && normalizedTitle.toLowerCase() !== part.tool.toLowerCase()
  const subject = summarizeInline((shouldUseTitle ? normalizedTitle : defaultToolSubject(part.tool)).trim(), 52)
  const created = isCreateTool(part.tool, title)
  if (created && /^created\b/i.test(subject)) return subject
  if (!created && /^thought about\b/i.test(subject)) return subject
  return created ? `Created ${subject}` : `Thought about ${subject}`
}

function toolElapsed(part: ToolPart) {
  if (!("time" in part.state) || !part.state.time) return null
  if (!("end" in part.state.time) || !part.state.time.end) return null
  return `${((part.state.time.end - part.state.time.start) / 1000).toFixed(1)}s`
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
    lineHeight: 24,
  },
  infoBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  infoSubtle: {
    fontSize: 11,
  },
  infoPath: {
    fontSize: 12,
  },
  infoCode: {
    fontFamily: "Geist Mono",
    fontSize: 12,
    lineHeight: 17,
    borderRadius: 8,
    padding: 8,
  },
  expandedPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    marginTop: 3,
  },
  collapsibleContainer: {
    marginVertical: 1,
    overflow: "hidden",
  },
  collapsibleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 28,
    gap: 8,
  },
  collapsibleLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "500",
  },
  collapsibleChevron: {
    width: 16,
    textAlign: "right",
    fontSize: 15,
    lineHeight: 16,
    fontWeight: "600",
  },
  reasoningExpanded: {
    paddingTop: 2,
  },
  infoLink: {
    fontSize: 12,
    fontWeight: "600",
  },
  toolExpanded: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    marginTop: 4,
  },
  toolMeta: {
    fontSize: 11,
    lineHeight: 14,
  },
  toolSection: {
    gap: 4,
  },
  attachment: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  attachmentText: {
    fontSize: 12,
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
  truncatedHintWrap: {
    paddingTop: 2,
  },
  truncatedHint: {
    fontSize: 12,
    fontWeight: "500",
  },
})
