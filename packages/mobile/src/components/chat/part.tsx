import { memo, useState, useCallback } from "react"
import { View, Text, Pressable, StyleSheet, LayoutAnimation, Linking } from "react-native"
import type {
  AgentPart,
  FilePart,
  Part,
  PatchPart,
  ReasoningPart,
  RetryPart,
  SnapshotPart,
  StepFinishPart,
  StepStartPart,
  TextPart,
  ToolPart,
} from "@opencode-ai/sdk/client"
import { useTheme } from "../../theme"
import { MarkdownRenderer } from "../markdown/renderer"

type SubtaskPart = Extract<Part, { type: "subtask" }>
type CompactionPart = Extract<Part, { type: "compaction" }>

type Props = {
  part: Part
  isUser: boolean
  renderMarkdown?: boolean
  onHydrateMessage?: (messageID: string) => void
}

export const PartRenderer = memo(function PartRenderer({
  part,
  isUser,
  renderMarkdown = true,
  onHydrateMessage,
}: Props) {
  switch (part.type) {
    case "text":
      return <TextPartView part={part} isUser={isUser} renderMarkdown={renderMarkdown} />
    case "reasoning":
      return <ReasoningPartView part={part} renderMarkdown={renderMarkdown} />
    case "tool":
      return <ToolPartView part={part} onHydrateMessage={onHydrateMessage} />
    case "file":
      return <FilePartView part={part} />
    case "step-start":
      return <StepStartPartView part={part} />
    case "step-finish":
      return <StepFinishPartView part={part} />
    case "snapshot":
      return <SnapshotPartView part={part} />
    case "patch":
      return <PatchPartView part={part} />
    case "agent":
      return <AgentPartView part={part} />
    case "retry":
      return <RetryPartView part={part} />
    case "subtask":
      return <SubtaskPartView part={part} renderMarkdown={renderMarkdown} />
    case "compaction":
      return <CompactionPartView part={part} />
    default:
      return null
  }
})

function TextPartView({ part, isUser, renderMarkdown }: { part: TextPart; isUser: boolean; renderMarkdown: boolean }) {
  const theme = useTheme()
  if (!part.text) return null

  if (isUser) {
    return <Text style={[styles.text, { color: theme.colors.userBubbleText }]}>{part.text}</Text>
  }

  if (!renderMarkdown) {
    return (
      <Text style={[styles.text, { color: theme.colors.textSecondary }]} numberOfLines={8}>
        {part.text}
      </Text>
    )
  }

  return <MarkdownRenderer>{part.text}</MarkdownRenderer>
}

function ReasoningPartView({ part, renderMarkdown }: { part: ReasoningPart; renderMarkdown: boolean }) {
  const theme = useTheme()
  const text = part.text?.trim()
  if (!text) return null

  return (
    <View style={[styles.infoCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.infoTitle, { color: theme.colors.textSecondary }]}>Reasoning</Text>
      {renderMarkdown ? (
        <MarkdownRenderer>{text}</MarkdownRenderer>
      ) : (
        <Text style={[styles.infoBody, { color: theme.colors.textSecondary }]} numberOfLines={8}>
          {text}
        </Text>
      )}
    </View>
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setExpanded((v) => !v)
  }, [expanded, part.state, requestHydration, status])

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

  const truncatedOutput =
    status === "completed" && "outputTruncated" in part.state && typeof part.state.outputTruncated === "boolean"
      ? part.state.outputTruncated
      : false

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
        </View>
      )}
    </Pressable>
  )
}

function FilePartView({ part }: { part: FilePart }) {
  const theme = useTheme()
  const name = part.filename || part.source?.path?.split("/").pop() || "Attached file"
  const sourceLabel = part.source
    ? part.source.type === "symbol"
      ? `${part.source.path} · ${part.source.name}`
      : part.source.path
    : part.mime

  return (
    <Pressable
      onPress={() => Linking.openURL(part.url).catch(() => {})}
      style={[styles.infoCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      <Text style={[styles.infoTitle, { color: theme.colors.text }]}>File</Text>
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
      <Text style={[styles.infoLink, { color: theme.colors.link }]}>Open attachment</Text>
    </Pressable>
  )
}

function StepStartPartView({ part }: { part: StepStartPart }) {
  return <InfoPart title="Step started" detail={part.snapshot ? `Snapshot: ${short(part.snapshot)}` : "Running..."} />
}

function StepFinishPartView({ part }: { part: StepFinishPart }) {
  const tokens = part.tokens.input + part.tokens.output + part.tokens.reasoning
  return (
    <InfoPart
      title="Step finished"
      detail={`${part.reason}${tokens > 0 ? ` · ${tokens} tokens` : ""}${part.cost ? ` · $${part.cost.toFixed(4)}` : ""}`}
    />
  )
}

function SnapshotPartView({ part }: { part: SnapshotPart }) {
  return <InfoPart title="Snapshot" detail={short(part.snapshot)} />
}

function PatchPartView({ part }: { part: PatchPart }) {
  const theme = useTheme()
  const visible = part.files.slice(0, 8)
  const remaining = Math.max(0, part.files.length - visible.length)

  return (
    <View style={[styles.infoCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.infoTitle, { color: theme.colors.text }]}>Patch</Text>
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
    </View>
  )
}

function AgentPartView({ part }: { part: AgentPart }) {
  return <InfoPart title="Agent" detail={part.name} />
}

function RetryPartView({ part }: { part: RetryPart }) {
  const error = part.error?.data?.message || "Unknown error"
  return <InfoPart title={`Retry #${part.attempt}`} detail={error} />
}

function SubtaskPartView({ part, renderMarkdown }: { part: SubtaskPart; renderMarkdown: boolean }) {
  const theme = useTheme()
  return (
    <View style={[styles.infoCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.infoTitle, { color: theme.colors.text }]}>Subtask</Text>
      <Text style={[styles.infoBody, { color: theme.colors.textSecondary }]}>{part.description}</Text>
      {part.prompt ? (
        renderMarkdown ? (
          <MarkdownRenderer>{part.prompt}</MarkdownRenderer>
        ) : (
          <Text style={[styles.infoBody, { color: theme.colors.textSecondary }]} numberOfLines={8}>
            {part.prompt}
          </Text>
        )
      ) : null}
      <Text style={[styles.infoSubtle, { color: theme.colors.textTertiary }]}>Agent: {part.agent}</Text>
    </View>
  )
}

function CompactionPartView({ part }: { part: CompactionPart }) {
  return (
    <InfoPart
      title="Context compacted"
      detail={part.auto ? "Automatic compaction applied." : "Manual compaction applied."}
    />
  )
}

function InfoPart({ title, detail }: { title: string; detail: string }) {
  const theme = useTheme()
  return (
    <View style={[styles.infoCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.infoTitle, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.infoBody, { color: theme.colors.textSecondary }]}>{detail}</Text>
    </View>
  )
}

function short(value: string) {
  if (value.length <= 32) return value
  return `${value.slice(0, 16)}...${value.slice(-8)}`
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
  infoCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 10,
    marginVertical: 4,
    gap: 6,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
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
    fontFamily: "Menlo",
    fontSize: 12,
    lineHeight: 17,
    borderRadius: 8,
    padding: 8,
  },
  infoLink: {
    fontSize: 12,
    fontWeight: "600",
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
