import { memo, useState, useCallback, useEffect, useMemo } from "react"
import { View, Text, Pressable, StyleSheet, Linking, Platform, useWindowDimensions } from "react-native"
import Feather from "@expo/vector-icons/Feather"
import { LinearGradient } from "expo-linear-gradient"
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
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
import { CodeBlock } from "../markdown/code-block"

type SubtaskPart = Extract<Part, { type: "subtask" }>
type CompactionPart = Extract<Part, { type: "compaction" }>
type BlurbAction = "thought" | "created" | "ran" | "explored"
export type TodoItem = {
  id: string
  content: string
  status: string
  priority: string
}
export type TodoSnapshot = {
  part: ToolPart
  todos: TodoItem[]
  active: TodoItem[]
  done: TodoItem[]
  completedCount: number
  isComplete: boolean
}
type Palette = ReturnType<typeof useTheme>["colors"]

const AnimatedView: any = Animated.View
const AnimatedLinearGradient: any = Animated.createAnimatedComponent(LinearGradient)
const FeatherIcon = Feather as unknown as React.ComponentType<{ name: string; size: number; color: string; style?: unknown }>
const COLLAPSIBLE_LAYOUT = LinearTransition.springify().damping(22).stiffness(260).mass(0.7)
const COLLAPSIBLE_ENTER = FadeIn.duration(140).easing(Easing.out(Easing.cubic))
const COLLAPSIBLE_EXIT = FadeOut.duration(110).easing(Easing.in(Easing.cubic))
const ACTION_WORD: Record<BlurbAction, string> = {
  thought: "Thought about",
  created: "Created",
  ran: "Ran",
  explored: "Explored",
}
const TODO_STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  pending: 1,
  completed: 2,
  cancelled: 3,
}
const TODO_PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
}
const READ_BLURB_MAX_CHARS = 6_000

type Props = {
  part: Part
  isUser: boolean
  isActive?: boolean
  isStreamingComplete?: boolean
  onHydrateMessage?: (messageID: string) => void
}

export const PartRenderer = memo(function PartRenderer({
  part,
  isUser,
  isActive = false,
  isStreamingComplete = true,
  onHydrateMessage,
}: Props) {
  switch (part.type) {
    case "text":
      return <TextPartView part={part} isUser={isUser} isStreamingComplete={isStreamingComplete} />
    case "reasoning":
      return <ReasoningPartView part={part} isActive={isActive} isStreamingComplete={isStreamingComplete} />
    case "tool":
      return <ToolPartView part={part} isActive={isActive} onHydrateMessage={onHydrateMessage} />
    case "file":
      return <FilePartView part={part} isActive={isActive} />
    case "step-start":
      return null
    case "step-finish":
      return null
    case "snapshot":
      return <SnapshotPartView part={part} isActive={isActive} />
    case "patch":
      return <PatchPartView part={part} isActive={isActive} />
    case "agent":
      return <AgentPartView part={part} isActive={isActive} />
    case "retry":
      return <RetryPartView part={part} isActive={isActive} />
    case "subtask":
      return <SubtaskPartView part={part} isActive={isActive} />
    case "compaction":
      return <CompactionPartView part={part} isActive={isActive} />
    default:
      return null
  }
})

function TextPartView({ part, isUser, isStreamingComplete }: { part: TextPart; isUser: boolean; isStreamingComplete: boolean }) {
  const theme = useTheme()
  if (!part.text) return null

  if (isUser) {
    return <Text style={[styles.text, { color: theme.colors.userBubbleText }]}>{part.text}</Text>
  }

  return <MarkdownRenderer isComplete={isStreamingComplete}>{part.text}</MarkdownRenderer>
}

function BlurbRow({
  label,
  action,
  isActive = false,
  expanded = false,
  onPress,
  showChevron = true,
}: {
  label: string
  action: BlurbAction
  isActive?: boolean
  expanded?: boolean
  onPress?: () => void
  showChevron?: boolean
}) {
  const theme = useTheme()
  const { width: screenWidth } = useWindowDimensions()
  const color = blurbActionColor(action, theme.colors)
  const verb = ACTION_WORD[action]
  const lower = label.toLowerCase()
  const lowerVerb = verb.toLowerCase()
  const shimmerX = useSharedValue(-screenWidth)
  const activeProgress = useSharedValue(isActive ? 1 : 0)
  const subject =
    lower.startsWith(lowerVerb) && label.length > verb.length
      ? label.slice(verb.length).trimStart()
      : label

  useEffect(() => {
    activeProgress.value = withTiming(isActive ? 1 : 0, {
      duration: isActive ? 180 : 120,
      easing: isActive ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    })

    if (!isActive) {
      cancelAnimation(shimmerX)
      shimmerX.value = -screenWidth
      return
    }

    shimmerX.value = -screenWidth * 0.7
    shimmerX.value = withRepeat(
      withTiming(screenWidth * 0.85, {
        duration: 1450,
        easing: Easing.linear,
      }),
      -1,
      false,
    )

    return () => {
      cancelAnimation(shimmerX)
    }
  }, [activeProgress, isActive, screenWidth, shimmerX])

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: activeProgress.value,
    transform: [{ translateX: shimmerX.value }],
  }))

  const activeGlowStyle = useAnimatedStyle(() => ({
    opacity: activeProgress.value,
  }))

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.collapsibleRow,
        isActive && {
          backgroundColor: withAlpha(color, theme.colors.background === "#09090b" ? 0.12 : 0.08),
          borderColor: withAlpha(color, theme.colors.background === "#09090b" ? 0.26 : 0.18),
        },
        onPress && pressed && styles.collapsibleRowPressed,
      ]}
    >
      {isActive ? (
        <>
          <AnimatedView
            pointerEvents="none"
            style={[
              styles.collapsibleRowGlow,
              activeGlowStyle,
              {
                backgroundColor: withAlpha(color, theme.colors.background === "#09090b" ? 0.07 : 0.05),
              },
            ]}
          />
          <AnimatedLinearGradient
            pointerEvents="none"
            colors={[withAlpha(color, 0), withAlpha(theme.colors.text, 0.22), withAlpha(color, 0)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.collapsibleRowShimmer, shimmerStyle, { width: Math.max(120, screenWidth * 0.36) }]}
          />
        </>
      ) : null}
      <View style={styles.collapsibleRowContent}>
        <View style={[styles.blurbDot, { backgroundColor: color }]} />
        <Text style={styles.collapsibleLabel} numberOfLines={1}>
          <Text style={[styles.collapsibleKeyword, { color }]}>{verb}</Text>
          {subject ? (
            <Text style={[styles.collapsibleSubject, { color: isActive ? theme.colors.text : theme.colors.textSecondary }]}>
              {" "}
              {subject}
            </Text>
          ) : (
            <Text style={[styles.collapsibleSubject, { color: isActive ? theme.colors.text : theme.colors.textSecondary }]}>
              {label}
            </Text>
          )}
        </Text>
        <View style={styles.collapsibleRight}>
          {isActive ? (
            <View
              style={[
                styles.liveBadge,
                {
                  backgroundColor: withAlpha(color, theme.colors.background === "#09090b" ? 0.16 : 0.1),
                  borderColor: withAlpha(color, theme.colors.background === "#09090b" ? 0.34 : 0.2),
                },
              ]}
            >
              <View style={[styles.liveBadgeDot, { backgroundColor: color }]} />
              <Text style={[styles.liveBadgeText, { color }]}>Live</Text>
            </View>
          ) : null}
          {showChevron ? (
            <View style={styles.collapsibleChevronSlot}>
              <CollapsibleChevron expanded={expanded} color={isActive ? theme.colors.textSecondary : theme.colors.textTertiary} />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

function CollapsibleContent({
  children,
  style,
}: {
  children: React.ReactNode
  style?: unknown
}) {
  const theme = useTheme()

  return (
    <AnimatedView
      entering={COLLAPSIBLE_ENTER}
      exiting={COLLAPSIBLE_EXIT}
      layout={COLLAPSIBLE_LAYOUT}
      style={[
        styles.expandedPanel,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.borderSubtle,
        },
        style,
      ]}
    >
      {children}
    </AnimatedView>
  )
}

function ReasoningPartView({
  part,
  isActive = false,
  isStreamingComplete,
}: {
  part: ReasoningPart
  isActive?: boolean
  isStreamingComplete: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const text = part.text?.trim()
  if (!text) return null

  const toggle = useCallback(() => {
    setExpanded((v) => !v)
  }, [])

  const label = summarizeBlurb("thought", summarizeInline(text, 52))

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <BlurbRow label={label} action="thought" isActive={isActive} expanded={expanded} onPress={toggle} />
      {expanded ? (
        <CollapsibleContent style={styles.reasoningExpanded}>
          <MarkdownRenderer variant="reasoning" isComplete={isStreamingComplete}>
            {text}
          </MarkdownRenderer>
        </CollapsibleContent>
      ) : null}
    </AnimatedView>
  )
}

function ToolPartView({
  part,
  isActive = false,
  onHydrateMessage,
}: {
  part: ToolPart
  isActive?: boolean
  onHydrateMessage?: (messageID: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const status = part.state.status
  const toolName = part.tool
  const title = "title" in part.state ? part.state.title : part.tool
  const todos = useMemo(() => extractToolTodos(part), [part])
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

  if (isTodoToolPart(part)) return null

  const summary = summarizeToolLabel(part, title || toolName, todos)
  const open = expanded

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <BlurbRow
        label={summary.label}
        action={summary.action}
        isActive={isActive}
        expanded={open}
        onPress={toggle}
        showChevron
      />
      {open ? (
        <CollapsibleContent style={styles.toolExpanded}>
          <ToolDetailView
            part={part}
            action={summary.action}
            onHydrateMessage={requestHydration}
          />
        </CollapsibleContent>
      ) : null}
    </AnimatedView>
  )
}

function ToolDetailView({
  part,
  action,
  onHydrateMessage,
}: {
  part: ToolPart
  action: BlurbAction
  onHydrateMessage: () => void
}) {
  const theme = useTheme()
  const status = part.state.status
  const elapsed = toolElapsed(part)
  const output =
    status === "completed" && "output" in part.state && typeof part.state.output === "string"
      ? part.state.output
      : ""
  const truncatedOutput =
    status === "completed" && "outputTruncated" in part.state && typeof part.state.outputTruncated === "boolean"
      ? part.state.outputTruncated
      : false

  const read = action === "explored" && part.tool === "read" && output ? parseReadOutput(output) : null

  if (action === "ran") {
    const command = toolCommand(part)
    const body =
      status === "error" && "error" in part.state
        ? part.state.error
        : output || (status === "running" ? "Running..." : status === "pending" ? "Queued..." : "No output")

    return (
      <View style={styles.toolSection}>
        <View
          style={[
            styles.terminal,
            { backgroundColor: theme.colors.codeBackground, borderColor: theme.colors.codeBorder },
          ]}
        >
          {command ? (
            <View style={styles.terminalCommandRow}>
              <Text style={[styles.terminalPrompt, { color: theme.colors.textTertiary }]}>$</Text>
              <Text style={[styles.terminalCommand, { color: theme.colors.codeText }]} selectable>
                {command}
              </Text>
            </View>
          ) : null}
          {command ? <View style={[styles.terminalDivider, { borderTopColor: theme.colors.codeBorder }]} /> : null}
          <Text style={[styles.terminalText, { color: theme.colors.codeText }]} selectable>
            {trimOutput(body, 2600)}
          </Text>
        </View>
        <View style={styles.toolFooter}>
          {elapsed ? <Text style={[styles.toolMeta, { color: theme.colors.textTertiary }]}>{elapsed}</Text> : null}
          {truncatedOutput ? (
            <Pressable onPress={onHydrateMessage} style={styles.truncatedHintWrap}>
              <Text style={[styles.truncatedHint, { color: theme.colors.link }]}>Load full output</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    )
  }

  if (read?.type === "file" && read.content) {
    const code = trimOutput(stripReadLineNumbers(read.content), READ_BLURB_MAX_CHARS)
    const language = languageFromPath(read.path)
    return (
      <View style={styles.toolSection}>
        {read.path ? (
          <Text style={[styles.exploredPath, { color: theme.colors.textTertiary }]} numberOfLines={1}>
            {read.path}
          </Text>
        ) : null}
        <CodeBlock code={code} language={language} />
        <View style={styles.toolFooter}>
          {elapsed ? <Text style={[styles.toolMeta, { color: theme.colors.textTertiary }]}>{elapsed}</Text> : null}
          {truncatedOutput ? (
            <Pressable onPress={onHydrateMessage} style={styles.truncatedHintWrap}>
              <Text style={[styles.truncatedHint, { color: theme.colors.link }]}>Load full output</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    )
  }

  const content =
    status === "completed"
      ? output
      : status === "error" && "error" in part.state
        ? part.state.error
        : toolInputPreview(part)

  return (
    <View style={styles.toolSection}>
      <View
        style={[
          styles.toolCard,
          { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderSubtle },
        ]}
      >
        <Text
          style={[
            styles.infoBody,
            action === "created" ? { color: theme.colors.textSecondary } : { color: theme.colors.text },
          ]}
          selectable
        >
          {trimOutput(content || "No details available", 2200)}
        </Text>
      </View>
      <View style={styles.toolFooter}>
        {elapsed ? <Text style={[styles.toolMeta, { color: theme.colors.textTertiary }]}>{elapsed}</Text> : null}
        {truncatedOutput ? (
          <Pressable onPress={onHydrateMessage} style={styles.truncatedHintWrap}>
            <Text style={[styles.truncatedHint, { color: theme.colors.link }]}>Load full output</Text>
          </Pressable>
        ) : null}
      </View>
      {status === "completed" &&
        "attachments" in part.state &&
        Array.isArray(part.state.attachments) &&
        part.state.attachments.length > 0 && (
          <View style={styles.toolAttachments}>
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
    </View>
  )
}

export function TodoPanel({
  snapshot,
  expanded = true,
  live = false,
  onToggle,
}: {
  snapshot: TodoSnapshot
  expanded?: boolean
  live?: boolean
  onToggle?: () => void
}) {
  const theme = useTheme()
  const completedSummary = `${snapshot.completedCount} of ${snapshot.todos.length} todos completed`

  return (
    <View style={styles.todoPanel}>
      <View style={styles.todoHead}>
        <View style={styles.todoHeadText}>
          <Text style={[styles.todoSummary, { color: theme.colors.text }]}>
            {completedSummary}
          </Text>
          {live ? (
            <View
              style={[
                styles.todoLiveBadge,
                {
                  backgroundColor: withAlpha(theme.colors.accent, theme.colors.background === "#09090b" ? 0.14 : 0.08),
                  borderColor: withAlpha(theme.colors.accent, theme.colors.background === "#09090b" ? 0.28 : 0.16),
                },
              ]}
            >
              <View style={[styles.todoLiveBadgeDot, { backgroundColor: theme.colors.accent }]} />
              <Text style={[styles.todoLiveBadgeText, { color: theme.colors.accent }]}>Live</Text>
            </View>
          ) : null}
        </View>
        {onToggle ? (
          <Pressable onPress={onToggle} hitSlop={8} accessibilityRole="button" accessibilityLabel={expanded ? "Collapse todos" : "Expand todos"}>
            <FeatherIcon name={expanded ? "chevron-up" : "chevron-down"} size={18} color={theme.colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      {!expanded ? null : snapshot.todos.length === 0 ? (
        <Text style={[styles.todoEmpty, { color: theme.colors.textTertiary }]}>No todos yet</Text>
      ) : (
        <View style={styles.todoList}>
          {snapshot.todos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} />
          ))}
        </View>
      )}
    </View>
  )
}

function TodoRow({ todo }: { todo: TodoItem }) {
  const theme = useTheme()
  const active = isActiveTodo(todo.status)
  const color = todoStatusColor(todo.status, theme.colors)

  return (
    <View style={styles.todoItem}>
      <View style={styles.todoIconSlot}>
        <FeatherIcon name={todoStatusIcon(todo.status)} size={12} color={color} />
      </View>
      <Text
        style={[
          styles.todoText,
          {
            color: active ? theme.colors.textSecondary : theme.colors.textTertiary,
            textDecorationLine: active ? "none" : "line-through",
          },
        ]}
        numberOfLines={2}
      >
        {todo.content}
      </Text>
      <Text style={[styles.todoState, { color }]}>{todoStatusLabel(todo.status)}</Text>
    </View>
  )
}

function FilePartView({ part, isActive = false }: { part: FilePart; isActive?: boolean }) {
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

  const label = summarizeBlurb("created", summarizeInline(name, 52))

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <BlurbRow label={label} action="created" isActive={isActive} expanded={expanded} onPress={toggle} />
      {expanded ? (
        <CollapsibleContent>
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
        </CollapsibleContent>
      ) : null}
    </AnimatedView>
  )
}

function SnapshotPartView({ part, isActive = false }: { part: SnapshotPart; isActive?: boolean }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)

  const toggle = useCallback(() => {
    setExpanded((v) => !v)
  }, [])

  const label = summarizeBlurb("created", "snapshot")

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <BlurbRow label={label} action="created" isActive={isActive} expanded={expanded} onPress={toggle} />
      {expanded ? (
        <CollapsibleContent>
          <Text style={[styles.infoBody, { color: theme.colors.textSecondary }]}>{short(part.snapshot)}</Text>
        </CollapsibleContent>
      ) : null}
    </AnimatedView>
  )
}

function PatchPartView({ part, isActive = false }: { part: PatchPart; isActive?: boolean }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)
  const visible = part.files.slice(0, 8)
  const remaining = Math.max(0, part.files.length - visible.length)
  const label = summarizeBlurb("created", `${part.files.length} file ${part.files.length === 1 ? "change" : "changes"}`)

  const toggle = useCallback(() => {
    setExpanded((v) => !v)
  }, [])

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <BlurbRow label={label} action="created" isActive={isActive} expanded={expanded} onPress={toggle} />
      {expanded ? (
        <CollapsibleContent>
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
        </CollapsibleContent>
      ) : null}
    </AnimatedView>
  )
}

function AgentPartView({ part, isActive = false }: { part: AgentPart; isActive?: boolean }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)

  const toggle = useCallback(() => {
    setExpanded((v) => !v)
  }, [])

  const label = summarizeBlurb("ran", `agent ${summarizeInline(part.name, 46)}`)

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <BlurbRow label={label} action="ran" isActive={isActive} expanded={expanded} onPress={toggle} />
      {expanded ? (
        <CollapsibleContent>
          <Text style={[styles.infoBody, { color: theme.colors.textSecondary }]}>{part.name}</Text>
        </CollapsibleContent>
      ) : null}
    </AnimatedView>
  )
}

function RetryPartView({ part, isActive = false }: { part: RetryPart; isActive?: boolean }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)
  const error = part.error?.data?.message || "Unknown error"

  const toggle = useCallback(() => {
    setExpanded((v) => !v)
  }, [])

  const label = summarizeBlurb("ran", `retry #${part.attempt}`)

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <BlurbRow label={label} action="ran" isActive={isActive} expanded={expanded} onPress={toggle} />
      {expanded ? (
        <CollapsibleContent>
          <Text style={[styles.infoBody, { color: theme.colors.textSecondary }]}>{error}</Text>
        </CollapsibleContent>
      ) : null}
    </AnimatedView>
  )
}

function SubtaskPartView({ part, isActive = false }: { part: SubtaskPart; isActive?: boolean }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)

  const toggle = useCallback(() => {
    setExpanded((v) => !v)
  }, [])

  const label = summarizeBlurb("thought", summarizeInline(part.description, 52))

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <BlurbRow label={label} action="thought" isActive={isActive} expanded={expanded} onPress={toggle} />
      {expanded ? (
        <CollapsibleContent>
          <Text style={[styles.infoBody, { color: theme.colors.textSecondary }]}>{part.description}</Text>
          {part.prompt ? <MarkdownRenderer>{part.prompt}</MarkdownRenderer> : null}
          <Text style={[styles.infoSubtle, { color: theme.colors.textTertiary }]}>Agent: {part.agent}</Text>
        </CollapsibleContent>
      ) : null}
    </AnimatedView>
  )
}

function CompactionPartView({ part, isActive = false }: { part: CompactionPart; isActive?: boolean }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)

  const toggle = useCallback(() => {
    setExpanded((v) => !v)
  }, [])

  const detail = part.auto ? "Automatic compaction applied." : "Manual compaction applied."
  const label = summarizeBlurb("ran", "context compaction")

  return (
    <AnimatedView style={styles.collapsibleContainer} layout={COLLAPSIBLE_LAYOUT}>
      <BlurbRow label={label} action="ran" isActive={isActive} expanded={expanded} onPress={toggle} />
      {expanded ? (
        <CollapsibleContent>
          <Text style={[styles.infoBody, { color: theme.colors.textSecondary }]}>{detail}</Text>
        </CollapsibleContent>
      ) : null}
    </AnimatedView>
  )
}

function CollapsibleChevron({ expanded, color }: { expanded: boolean; color: string }) {
  const progress = useSharedValue(expanded ? 1 : 0)

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, {
      duration: Platform.OS === "ios" ? 185 : 165,
      easing: Platform.OS === "ios" ? Easing.bezier(0.2, 0.84, 0.2, 1) : Easing.out(Easing.cubic),
    })
  }, [expanded, progress])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.66 + progress.value * 0.34,
    transform: [{ rotate: `${progress.value * 90}deg` }],
  }))

  return (
    <AnimatedView style={[styles.collapsibleChevron, animatedStyle]}>
      <FeatherIcon name="chevron-right" size={15} color={color} />
    </AnimatedView>
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

function defaultToolSubject(tool: string) {
  const normalized = tool.toLowerCase()
  if (normalized === "todowrite" || normalized === "todoread") return "todo list"
  if (normalized.includes("glob") || normalized.includes("list") || normalized.includes("ls")) return "project files"
  if (normalized.includes("bash") || normalized.includes("shell") || normalized.includes("command")) return "terminal command"
  if (normalized.includes("grep") || normalized.includes("find") || normalized.includes("search")) return "relevant matches"
  if (normalized.includes("fetch") || normalized.includes("web")) return "web results"
  if (normalized.includes("read") || normalized.includes("cat")) return "file contents"
  if (normalized.includes("patch") || normalized.includes("edit") || normalized.includes("write")) return "project changes"
  if (normalized.includes("task")) return "delegated task"
  if (normalized.includes("question")) return "a clarification"
  return tool
}

function summarizeToolLabel(part: ToolPart, title: string, todos: TodoItem[]) {
  const normalizedTitle = title.replace(/\s+/g, " ").trim()
  const shouldUseTitle = normalizedTitle.length > 0 && normalizedTitle.toLowerCase() !== part.tool.toLowerCase()
  const raw = (shouldUseTitle ? normalizedTitle : defaultToolSubject(part.tool)).trim()
  const known = parseBlurbAction(raw)
  if (known) return { label: capitalizeInline(raw), action: known }
  const action = inferToolAction(part.tool, normalizedTitle, todos)
  const subject = part.tool === "todowrite" || part.tool === "todoread" ? "todo list" : raw
  return { label: summarizeBlurb(action, summarizeInline(subject, 52)), action }
}

function summarizeBlurb(action: BlurbAction, subject: string) {
  const known = parseBlurbAction(subject)
  if (known) return capitalizeInline(subject)
  return `${ACTION_WORD[action]} ${subject}`
}

function parseBlurbAction(value: string): BlurbAction | null {
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith("thought about ")) return "thought"
  if (normalized.startsWith("created ")) return "created"
  if (normalized.startsWith("ran ")) return "ran"
  if (normalized.startsWith("explored ")) return "explored"
  return null
}

function inferToolAction(tool: string, title: string, todos: TodoItem[]): BlurbAction {
  const byTitle = parseBlurbAction(title)
  if (byTitle) return byTitle

  const normalizedTool = tool.toLowerCase()
  const normalizedTitle = title.toLowerCase()

  if (normalizedTool === "todowrite") {
    if (todos.length === 0) return "created"
    if (todos.every((item) => item.status === "pending")) return "created"
    return "ran"
  }

  if (normalizedTool === "todoread") return "explored"
  if (/(write|edit|patch|apply_patch|multiedit|create|mkdir|mv|cp|save|rename)/.test(normalizedTool)) return "created"
  if (/(bash|shell|command|task|batch|question|plan)/.test(normalizedTool)) return "ran"
  if (/(read|cat|glob|list|ls|grep|find|search|fetch|web|code|lsp)/.test(normalizedTool)) return "explored"
  if (/^(created?|updated?|edited?|wrote|saved)\b/.test(normalizedTitle)) return "created"
  if (/^(ran|running|executed|launched)\b/.test(normalizedTitle)) return "ran"
  if (/^(explored|searched|read|listed|fetched)\b/.test(normalizedTitle)) return "explored"
  return "thought"
}

export function isTodoToolPart(part: Part | ToolPart): part is ToolPart {
  return part.type === "tool" && (part.tool === "todowrite" || part.tool === "todoread")
}

export function extractToolTodos(part: ToolPart) {
  if (!isTodoToolPart(part)) return []
  const fromInput = normalizeTodos(part.state.input?.todos)
  if (fromInput.length > 0) return sortTodos(fromInput)
  if (!("metadata" in part.state) || !part.state.metadata) return []
  if (typeof part.state.metadata !== "object") return []
  const meta = part.state.metadata as Record<string, unknown>
  return sortTodos(normalizeTodos(meta.todos))
}

function normalizeTodos(input: unknown): TodoItem[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((item, index) => {
    if (!item || typeof item !== "object") return []
    const raw = item as Record<string, unknown>
    const content = typeof raw.content === "string" ? raw.content.trim() : ""
    if (!content) return []
    const status = typeof raw.status === "string" ? raw.status.trim().toLowerCase() : "pending"
    const priority = typeof raw.priority === "string" ? raw.priority.trim().toLowerCase() : "medium"
    const id = typeof raw.id === "string" && raw.id.trim() ? raw.id : `${index}:${content}`
    return [{ id, content, status, priority }]
  })
}

function sortTodos(todos: TodoItem[]) {
  return [...todos].sort((a, b) => {
    const statusDelta = (TODO_STATUS_ORDER[a.status] ?? 9) - (TODO_STATUS_ORDER[b.status] ?? 9)
    if (statusDelta !== 0) return statusDelta
    const priorityDelta = (TODO_PRIORITY_ORDER[a.priority] ?? 9) - (TODO_PRIORITY_ORDER[b.priority] ?? 9)
    if (priorityDelta !== 0) return priorityDelta
    return a.content.localeCompare(b.content)
  })
}

export function isActiveTodo(status: string) {
  return status !== "completed" && status !== "cancelled"
}

function buildTodoSnapshot(part: ToolPart): TodoSnapshot | null {
  if (!isTodoToolPart(part)) return null
  const todos = extractToolTodos(part)
  if (todos.length === 0) return null
  const active = todos.filter((item) => isActiveTodo(item.status))
  const done = todos.filter((item) => !isActiveTodo(item.status))
  const completedCount = todos.filter((item) => item.status === "completed").length
  return {
    part,
    todos,
    active,
    done,
    completedCount,
    isComplete: active.length === 0,
  }
}

export function resolveLatestTodoSnapshot(parts: Part[]) {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i]
    if (!isTodoToolPart(part)) continue
    const snapshot = buildTodoSnapshot(part)
    if (snapshot) return snapshot
  }
  return null
}

function todoStatusLabel(status: string) {
  if (status === "in_progress") return "ACTIVE"
  if (status === "pending") return "PENDING"
  if (status === "completed") return "DONE"
  if (status === "cancelled") return "CANCELLED"
  return status.toUpperCase()
}

function todoStatusIcon(status: string) {
  if (status === "in_progress") return "play-circle"
  if (status === "completed") return "check-circle"
  if (status === "cancelled") return "x-circle"
  return "circle"
}

function todoStatusColor(status: string, colors: Palette) {
  if (status === "in_progress") return colors.statusBusy
  if (status === "pending") return colors.warning
  if (status === "completed") return colors.statusIdle
  if (status === "cancelled") return colors.textTertiary
  return colors.textTertiary
}

function blurbActionColor(action: BlurbAction, colors: Palette) {
  if (action === "created") return colors.statusIdle
  if (action === "ran") return colors.accent
  if (action === "explored") return colors.warning
  return colors.textSecondary
}

function withAlpha(color: string, alpha: number) {
  const normalized = color.trim()
  if (!normalized.startsWith("#")) return color
  const hex = normalized.slice(1)
  if (hex.length !== 6) return color
  const value = Math.max(0, Math.min(255, Math.round(alpha * 255)))
  return `#${hex}${value.toString(16).padStart(2, "0")}`
}

function capitalizeInline(value: string) {
  if (!value) return value
  return value[0].toUpperCase() + value.slice(1)
}

function toolElapsed(part: ToolPart) {
  if (!("time" in part.state) || !part.state.time) return null
  if (!("end" in part.state.time) || !part.state.time.end) return null
  return `${((part.state.time.end - part.state.time.start) / 1000).toFixed(1)}s`
}

function toolCommand(part: ToolPart) {
  const input = part.state.input
  const direct = ["command", "cmd", "script"]
    .map((key) => input[key])
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)
  if (direct) return direct.trim()

  if (part.tool === "task") {
    const description = input.description
    if (typeof description === "string" && description.trim()) return `task ${description.trim()}`
  }

  const firstString = Object.values(input).find((value): value is string => typeof value === "string" && value.trim().length > 0)
  if (firstString) return summarizeInline(firstString.trim(), 160)
  return ""
}

function toolInputPreview(part: ToolPart) {
  const input = part.state.input
  const ordered = ["pattern", "url", "filePath", "path", "description", "prompt", "subagent_type"]
  const direct = ordered
    .map((key) => input[key])
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)
  if (direct) return direct.trim()

  const first = Object.values(input).find((value): value is string => typeof value === "string" && value.trim().length > 0)
  if (first) return first.trim()

  const keys = Object.keys(input)
  if (keys.length === 0) return ""
  if (keys.length === 1) return `${keys[0]}`
  return `${keys.length} parameters`
}

function trimOutput(value: string, maxChars: number) {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}\n...`
}

function parseReadOutput(output: string) {
  const path = extractTag(output, "path")
  const type = extractTag(output, "type")
  const content = extractTag(output, "content")
  if (!type || !content) return null
  return { path, type, content }
}

function extractTag(value: string, tag: string) {
  const match = value.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))
  return match?.[1]?.trim() ?? ""
}

function stripReadLineNumbers(content: string) {
  const core = content
    .replace(/\n\n\((?:End of file|Showing lines)[\s\S]*$/m, "")
    .split("\n")
    .map((line) => line.replace(/^\d+:\s?/, ""))
    .join("\n")
    .trimEnd()

  return core || content.trimEnd()
}

function languageFromPath(filePath: string) {
  const normalized = filePath.toLowerCase()
  if (normalized.endsWith(".tsx") || normalized.endsWith(".ts")) return "ts"
  if (normalized.endsWith(".jsx") || normalized.endsWith(".js") || normalized.endsWith(".mjs") || normalized.endsWith(".cjs")) return "js"
  if (normalized.endsWith(".py")) return "py"
  if (normalized.endsWith(".sh") || normalized.endsWith(".bash") || normalized.endsWith(".zsh")) return "sh"
  if (normalized.endsWith(".json")) return "json"
  if (normalized.endsWith(".md")) return "markdown"
  if (normalized.endsWith(".yml") || normalized.endsWith(".yaml")) return "yaml"
  return "text"
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
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 11,
    gap: 10,
    marginTop: 4,
  },
  collapsibleContainer: {
    marginVertical: 1,
    overflow: "hidden",
  },
  collapsibleRow: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    overflow: "hidden",
  },
  collapsibleRowPressed: {
    opacity: 0.6,
  },
  collapsibleRowGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  collapsibleRowShimmer: {
    position: "absolute",
    top: -10,
    bottom: -10,
  },
  collapsibleRowContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  blurbDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
  },
  collapsibleLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 19,
    marginLeft: 8,
    marginRight: 8,
  },
  collapsibleKeyword: {
    fontWeight: "600",
  },
  collapsibleSubject: {
    fontWeight: "500",
  },
  collapsibleRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  liveBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  liveBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  collapsibleChevronSlot: {
    width: 18,
    minHeight: 16,
    justifyContent: "center",
  },
  collapsibleChevron: {
    width: 18,
    minHeight: 16,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 1,
  },
  reasoningExpanded: {
    paddingTop: 2,
  },
  infoLink: {
    fontSize: 12,
    fontWeight: "600",
  },
  toolExpanded: {
    gap: 10,
  },
  toolMeta: {
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 2,
  },
  todoPanel: {
    gap: 10,
  },
  todoHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  todoHeadText: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  todoSummary: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
  },
  todoLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  todoLiveBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  todoLiveBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  todoList: {
    gap: 6,
  },
  todoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 20,
  },
  todoIconSlot: {
    width: 14,
    alignItems: "center",
  },
  todoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
  },
  todoState: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  todoEmpty: {
    fontSize: 12,
    lineHeight: 16,
    fontStyle: "italic",
  },
  toolSection: {
    gap: 8,
  },
  toolCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 6,
  },
  terminal: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  terminalCommandRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  terminalPrompt: {
    fontFamily: "Geist Mono",
    fontSize: 12,
    lineHeight: 18,
  },
  terminalCommand: {
    flex: 1,
    fontFamily: "Geist Mono",
    fontSize: 12,
    lineHeight: 18,
  },
  terminalDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  terminalText: {
    fontFamily: "Geist Mono",
    fontSize: 12,
    lineHeight: 18,
  },
  exploredPath: {
    fontFamily: "Geist Mono",
    fontSize: 11,
    lineHeight: 15,
  },
  toolFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  toolAttachments: {
    gap: 6,
  },
  attachment: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "transparent",
  },
  attachmentText: {
    fontSize: 12,
  },
  truncatedHintWrap: {
    paddingTop: 2,
  },
  truncatedHint: {
    fontSize: 12,
    fontWeight: "500",
  },
})
