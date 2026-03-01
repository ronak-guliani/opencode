import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Platform, StyleSheet, Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native"
import Feather from "@expo/vector-icons/Feather"
import { useRouter } from "expo-router"
import type { Message } from "@opencode-ai/sdk/client"
import { LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list"
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller"
import Animated, { useAnimatedStyle } from "react-native-reanimated"
import { useMessages } from "../../store/messages"
import { useSessions } from "../../store/sessions"
import { computeSummary, useDiffs } from "../../store/diffs"
import type { SessionFileDiff } from "../../features/diff/types"
import { synthesizeSessionDiff } from "../../features/diff/synthetic"
import { resolveDiffLineCounts } from "../../features/diff/counts"
import { addCrashBreadcrumb } from "../../perf/crash-breadcrumbs"
import { useSessionDiffSummary, useSessionPartsMap } from "../../api/hooks"
import { FEATURE_FLAGS } from "../../config/feature-flags"
import { useChat } from "./provider"
import { useTheme } from "../../theme"
import { UserMessage } from "./user-message"
import { AssistantMessage } from "./assistant-message"
import { DiffSummaryCard } from "./diff-summary-card"
import {
  hasChanges,
  resolveEffectiveSessionData,
  resolveFootersByAssistant,
  resolveSessionFooterMeta,
  resolveTurnDiffs,
  resolveTurnFooterMeta,
  type DiffFooterMeta,
} from "./diff-ui-logic"

const STREAM_AUTOFOLLOW_MIN_GROWTH = 8
const JUMP_TO_BOTTOM_DISTANCE = 320
const AnimatedView = Animated.View as React.ComponentType<{ style?: unknown; children?: React.ReactNode }>
const FeatherIcon = Feather as unknown as React.ComponentType<{ name: string; size: number; color: string; style?: unknown }>
const Glass = LiquidGlassView as React.ComponentType<{
  interactive?: boolean
  style?: unknown
  children?: React.ReactNode
}>
const EMPTY_DIFFS: SessionFileDiff[] = []
const EMPTY_DIFF_FOOTERS: DiffFooterMeta[] = []

type Props = {
  sessionId: string
  messages: Message[]
  topPadding?: number
}

function asString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function asNumber(value: unknown) {
  return Number.isFinite(value) ? Number(value) : 0
}

function resolveFilePath(diff: Record<string, unknown>) {
  const candidates = [
    diff.file,
    diff.path,
    diff.filePath,
    diff.filepath,
    diff.relativePath,
    diff.filename,
    diff.name,
  ]
  for (const candidate of candidates) {
    const value = asString(candidate).trim()
    if (value) return value
  }
  return ""
}

function normalizeDiffEntry(input: unknown): SessionFileDiff | null {
  const diff = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const file = resolveFilePath(diff)
  if (!file) return null
  const before = asString(diff.before)
  const after = asString(diff.after)
  const providedAdditions = Math.max(0, asNumber(diff.additions))
  const providedDeletions = Math.max(0, asNumber(diff.deletions))
  const status = asString(diff.status || diff.type) || undefined
  const { additions, deletions } = resolveDiffLineCounts({
    file,
    before,
    after,
    additions: providedAdditions,
    deletions: providedDeletions,
    status,
  })

  return {
    file,
    before,
    after,
    additions,
    deletions,
    status,
  }
}

function dedupeDiffs(input: SessionFileDiff[]): SessionFileDiff[] {
  const byFile = new Map<string, SessionFileDiff>()
  for (const entry of input) {
    if (!entry.file) continue
    const previous = byFile.get(entry.file)
    if (!previous) {
      byFile.set(entry.file, entry)
      continue
    }

    const before = entry.before || previous.before
    const after = entry.after || previous.after
    byFile.set(entry.file, {
      file: entry.file,
      before,
      after,
      additions: Math.max(previous.additions, entry.additions),
      deletions: Math.max(previous.deletions, entry.deletions),
      status: entry.status ?? previous.status,
    })
  }
  return [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file))
}

function normalizeDiffList(input: unknown): SessionFileDiff[] {
  if (!Array.isArray(input) || input.length === 0) return EMPTY_DIFFS
  const normalized = input
    .map((item) => normalizeDiffEntry(item))
    .filter((item): item is SessionFileDiff => !!item)
  if (normalized.length === 0) return EMPTY_DIFFS
  return dedupeDiffs(normalized)
}

export function MessagesList({ sessionId, messages, topPadding }: Props) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const theme = useTheme()
  const keyboard = useReanimatedKeyboardAnimation()
  const { listRef, isAtEnd, messageCount, composerH } = useChat()
  const loadMore = useMessages((s) => s.loadMore)
  const loadingSession = useMessages(useCallback((s) => s.loading[sessionId] ?? false, [sessionId]))
  const exhaustedSession = useMessages(useCallback((s) => s.exhausted[sessionId] ?? false, [sessionId]))
  const session = useSessions(useCallback((s) => s.sessions.find((item) => item.id === sessionId), [sessionId]))
  const isBusy = useSessions(useCallback((s) => s.statuses[sessionId]?.type === "busy", [sessionId]))
  const fetchSessionDiff = useDiffs((s) => s.fetchSessionDiff)
  const sessionDiffs = useDiffs(useCallback((s) => s.bySession[sessionId] ?? EMPTY_DIFFS, [sessionId]))
  const sessionDiffLoading = useDiffs(useCallback((s) => s.loading[sessionId] ?? false, [sessionId]))
  const sessionDiffFetchedAt = useDiffs(useCallback((s) => s.fetchedAt[sessionId] ?? 0, [sessionId]))
  const partsByMessage = useSessionPartsMap(sessionId)
  const [showJump, setShowJump] = useState(false)

  const didInitialScroll = useRef(false)
  const prevCount = useRef(0)
  const raf = useRef<number | null>(null)
  const loadingMoreRef = useRef(false)
  const userInteractingRef = useRef(false)
  const momentumActiveRef = useRef(false)
  const contentHeightRef = useRef(0)
  const jumpVisibleRef = useRef(false)
  const malformedMessageKeysRef = useRef(new Set<string>())

  const logMalformedMessage = useCallback(
    (reason: string, item: unknown, index: number) => {
      const candidate = (item && typeof item === "object" ? item : {}) as { id?: unknown; role?: unknown }
      const itemID = asString(candidate.id)
      const role = asString(candidate.role)
      const key = `${reason}:${itemID || "no-id"}:${role || "no-role"}:${index}`
      if (malformedMessageKeysRef.current.has(key)) return
      malformedMessageKeysRef.current.add(key)
      addCrashBreadcrumb(
        "chat-list:malformed-item",
        {
          reason,
          sessionID: sessionId,
          itemID,
          role,
          index,
        },
        "warn",
      )
    },
    [sessionId],
  )

  const count = messages.length
  const latestAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const candidate = messages[i]
      if (candidate && candidate.role === "assistant") return i
    }
    return -1
  }, [messages])

  const apiDiffs = useMemo(() => {
    const normalized = sessionDiffs
      .map((item) => normalizeDiffEntry(item))
      .filter((item): item is SessionFileDiff => !!item)
    return dedupeDiffs(normalized)
  }, [sessionDiffs])
  const hasRenderableSessionDiffs = apiDiffs.length > 0
  const includeSyntheticFallback = !isBusy && !hasRenderableSessionDiffs && messages.length > 0
  const {
    historyDiffs: sessionHistoryDiffs,
    historySummary: sessionHistorySummary,
    syntheticDiffs: syntheticSessionDiffs,
    syntheticSummary: syntheticSessionSummary,
  } = useSessionDiffSummary(sessionId, { includeSynthetic: includeSyntheticFallback })

  const mergedSessionDiffs = apiDiffs
  const mergedSessionSummary = useMemo(() => computeSummary(mergedSessionDiffs), [mergedSessionDiffs])

  const sessionSummary = useMemo(
    () => ({
      files: Math.max(0, session?.summary?.files ?? 0),
      additions: Math.max(0, session?.summary?.additions ?? 0),
      deletions: Math.max(0, session?.summary?.deletions ?? 0),
    }),
    [session?.summary?.additions, session?.summary?.deletions, session?.summary?.files],
  )

  const { diffs: effectiveSessionDiffs, summary: effectiveSessionSummary } = useMemo(
    () =>
      resolveEffectiveSessionData({
        apiDiffs: mergedSessionDiffs,
        apiSummary: mergedSessionSummary,
        historyDiffs: sessionHistoryDiffs,
        historySummary: sessionHistorySummary,
        syntheticDiffs: syntheticSessionDiffs,
        syntheticSummary: syntheticSessionSummary,
        sessionSummary,
      }),
    [
      mergedSessionDiffs,
      mergedSessionSummary,
      sessionHistoryDiffs,
      sessionHistorySummary,
      sessionSummary,
      syntheticSessionDiffs,
      syntheticSessionSummary,
    ],
  )

  useEffect(() => {
    if (!sessionId) return
    if (hasRenderableSessionDiffs) return

    if (isBusy || hasChanges(sessionSummary) || hasChanges(sessionHistorySummary)) {
      addCrashBreadcrumb("chat-list:auto-fetch-diff", { sessionID: sessionId, reason: "busy-or-summary" })
      void fetchSessionDiff(sessionId)
      return
    }

    const timer = setTimeout(() => {
      addCrashBreadcrumb("chat-list:auto-fetch-diff", { sessionID: sessionId, reason: "deferred-old-session" })
      void fetchSessionDiff(sessionId)
    }, 220)

    return () => clearTimeout(timer)
  }, [
    fetchSessionDiff,
    hasRenderableSessionDiffs,
    isBusy,
    sessionId,
    sessionHistorySummary.additions,
    sessionHistorySummary.deletions,
    sessionHistorySummary.files,
    sessionSummary.additions,
    sessionSummary.deletions,
    sessionSummary.files,
  ])

  const latestAssistant = latestAssistantIndex >= 0 ? messages[latestAssistantIndex] : undefined
  const latestAssistantCreatedAt = useMemo(() => {
    if (!latestAssistant || latestAssistant.role !== "assistant") return 0
    return Math.max(0, asNumber(latestAssistant.time?.created))
  }, [latestAssistant])

  const assistantMessagesByParentID = useMemo(() => {
    const result = new Map<string, Message[]>()
    for (const message of messages) {
      if (!message || message.role !== "assistant") continue
      const parentID = asString((message as { parentID?: unknown }).parentID)
      if (!parentID) continue
      const existing = result.get(parentID)
      if (existing) existing.push(message)
      else result.set(parentID, [message])
    }
    return result
  }, [messages])

  const userMessagesByID = useMemo(() => {
    const result = new Map<string, Message>()
    for (const message of messages) {
      if (!message || message.role !== "user") continue
      if (typeof message.id !== "string" || !message.id) continue
      result.set(message.id, message)
    }
    return result
  }, [messages])

  const userSummaryDiffsByID = useMemo(() => {
    const result = new Map<string, SessionFileDiff[]>()
    for (const message of messages) {
      if (!message || message.role !== "user") continue
      if (typeof message.id !== "string" || !message.id) continue
      const summaryDiffs = (message as { summary?: { diffs?: unknown } }).summary?.diffs
      result.set(message.id, normalizeDiffList(summaryDiffs))
    }
    return result
  }, [messages])

  useEffect(() => {
    if (!isBusy || !latestAssistantCreatedAt) return
    if (sessionDiffFetchedAt >= latestAssistantCreatedAt) return
    addCrashBreadcrumb("chat-list:busy-diff-refresh", {
      sessionID: sessionId,
      fetchedAt: sessionDiffFetchedAt,
      assistantCreatedAt: latestAssistantCreatedAt,
    })
    void fetchSessionDiff(sessionId, { force: true })
  }, [fetchSessionDiff, isBusy, latestAssistantCreatedAt, sessionDiffFetchedAt, sessionId])

  const sessionFooterMeta = useMemo(
    () =>
      resolveSessionFooterMeta({
        messageCount: count,
        effectiveSessionDiffs,
        effectiveSessionSummary,
        isBusy,
        sessionDiffLoading,
      }),
    [count, effectiveSessionDiffs, effectiveSessionSummary, isBusy, sessionDiffLoading],
  )

  const turnFooterByAssistantID = useMemo(() => {
    const result = new Map<string, DiffFooterMeta>()
    for (const [parentID, assistants] of assistantMessagesByParentID.entries()) {
      if (!parentID || assistants.length === 0) continue
      const targetAssistant = assistants[assistants.length - 1]
      if (!targetAssistant || typeof targetAssistant.id !== "string" || !targetAssistant.id) continue

      const summaryDiffs = userSummaryDiffsByID.get(parentID) ?? EMPTY_DIFFS
      let syntheticDiffs = EMPTY_DIFFS
      const userMessage = userMessagesByID.get(parentID)
      if (userMessage) {
        try {
          syntheticDiffs = normalizeDiffList(synthesizeSessionDiff([userMessage, ...assistants], partsByMessage))
        } catch {
          syntheticDiffs = EMPTY_DIFFS
        }
      }

      const turnDiffs = resolveTurnDiffs(summaryDiffs, syntheticDiffs, { preferSynthetic: true })
      const turnSummary = computeSummary(turnDiffs)
      const turnFooterMeta = resolveTurnFooterMeta({
        latestTurnDiffs: turnDiffs,
        latestTurnSummary: turnSummary,
        latestTurnMessageID: parentID,
        isBusy,
      })
      if (turnFooterMeta) result.set(targetAssistant.id, turnFooterMeta)
    }
    return result
  }, [assistantMessagesByParentID, isBusy, partsByMessage, userMessagesByID, userSummaryDiffsByID])

  const diffFootersByAssistantID = useMemo(() => {
    const latestAssistantID =
      latestAssistant && latestAssistant.role === "assistant" && typeof latestAssistant.id === "string" ? latestAssistant.id : ""
    return resolveFootersByAssistant({
      turnFooterByAssistantID,
      latestAssistantID,
      sessionFooterMeta,
    })
  }, [latestAssistant, sessionFooterMeta, turnFooterByAssistantID])

  const openDiff = useCallback(
    (meta: DiffFooterMeta) => {
      if (meta.mode === "session") {
        void fetchSessionDiff(sessionId, { force: true })
        router.push(`/(main)/session/${sessionId}/diff?mode=session`)
        return
      }
      if (!meta.turnMessageID) {
        router.push(`/(main)/session/${sessionId}/diff?mode=session`)
        return
      }
      router.push(`/(main)/session/${sessionId}/diff?mode=turn&turnMessageID=${encodeURIComponent(meta.turnMessageID)}`)
    },
    [fetchSessionDiff, router, sessionId],
  )

  const padTop = topPadding ?? insets.top + 16
  const padBottom = Math.max(insets.bottom + 12, composerH + 4)

  const scheduleScrollToEnd = useCallback(
    (animated: boolean) => {
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current)
        raf.current = null
      }
      raf.current = requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated })
        if (jumpVisibleRef.current) {
          jumpVisibleRef.current = false
          setShowJump(false)
        }
        raf.current = null
      })
    },
    [listRef],
  )

  useEffect(() => {
    return () => {
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current)
        raf.current = null
      }
    }
  }, [])

  useEffect(() => {
    addCrashBreadcrumb("chat-list:session-change", { sessionID: sessionId })
    malformedMessageKeysRef.current.clear()
    didInitialScroll.current = false
    prevCount.current = 0
    userInteractingRef.current = false
    momentumActiveRef.current = false
    contentHeightRef.current = 0
    jumpVisibleRef.current = false
    setShowJump(false)
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current)
      raf.current = null
    }
  }, [sessionId])

  useEffect(() => {
    messageCount.value = count
  }, [count, messageCount])

  useEffect(() => {
    loadingMoreRef.current = loadingSession
  }, [loadingSession])

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Message>) => {
      if (!item || typeof item !== "object") {
        logMalformedMessage("render-invalid-object", item, index)
        return null
      }
      if (item.role === "user") {
        if (typeof item.id !== "string") {
          logMalformedMessage("render-user-missing-id", item, index)
          return null
        }
        return <UserMessage message={item} />
      }
      if (item.role === "assistant") {
        if (typeof item.id !== "string") {
          logMalformedMessage("render-assistant-missing-id", item, index)
          return null
        }
        const footerMetas = diffFootersByAssistantID.get(item.id) ?? EMPTY_DIFF_FOOTERS
        return (
          <AssistantMessage
            message={item}
            showFooter={index === latestAssistantIndex}
            diffFooter={
              footerMetas.length > 0 ? (
                <View style={styles.diffFooterStack}>
                  {footerMetas.map((meta, footerIndex) => (
                    <DiffSummaryCard
                      key={`${meta.mode}:${meta.turnMessageID || "session"}:${footerIndex}`}
                      mode={meta.mode}
                      title={meta.mode === "turn" ? "Turn diff" : "Session diff"}
                      diffs={meta.diffs}
                      summary={meta.summary}
                      isUpdating={meta.isUpdating}
                      onPress={() => openDiff(meta)}
                    />
                  ))}
                </View>
              ) : null
            }
          />
        )
      }
      return null
    },
    [diffFootersByAssistantID, latestAssistantIndex, logMalformedMessage, openDiff],
  )

  const keyExtractor = useCallback((item: Message, index: number) => {
    if (item && typeof item.id === "string" && item.id.length > 0) return item.id
    logMalformedMessage("key-extractor-fallback", item, index)
    return `unknown-message-${index}`
  }, [logMalformedMessage])

  const getItemType = useCallback((item: Message) => {
    if (item && typeof item.role === "string") return item.role
    logMalformedMessage("get-item-type-fallback", item, -1)
    return "unknown"
  }, [logMalformedMessage])

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
      const distance = contentSize.height - contentOffset.y - layoutMeasurement.height
      isAtEnd.value = distance < 150
      const shouldShow = distance > JUMP_TO_BOTTOM_DISTANCE
      if (jumpVisibleRef.current !== shouldShow) {
        jumpVisibleRef.current = shouldShow
        setShowJump(shouldShow)
      }
    },
    [isAtEnd],
  )

  const onStartReached = useCallback(() => {
    if (!didInitialScroll.current) return
    if (loadingMoreRef.current || exhaustedSession) return
    loadingMoreRef.current = true
    void loadMore(sessionId).finally(() => {
      loadingMoreRef.current = false
    })
  }, [loadMore, sessionId, exhaustedSession])

  const onScrollBeginDrag = useCallback(() => {
    userInteractingRef.current = true
  }, [])

  const onScrollEndDrag = useCallback(() => {
    if (!momentumActiveRef.current) {
      userInteractingRef.current = false
    }
  }, [])

  const onMomentumScrollBegin = useCallback(() => {
    momentumActiveRef.current = true
    userInteractingRef.current = true
  }, [])

  const onMomentumScrollEnd = useCallback(() => {
    momentumActiveRef.current = false
    userInteractingRef.current = false
  }, [])

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      const previousHeight = contentHeightRef.current
      contentHeightRef.current = height

      if (!didInitialScroll.current) return
      if (previousHeight <= 0) return
      if (height - previousHeight < STREAM_AUTOFOLLOW_MIN_GROWTH) return
      if (loadingMoreRef.current) return
      if (count > prevCount.current) return
      if (!isAtEnd.value) return
      if (userInteractingRef.current || momentumActiveRef.current) return

      scheduleScrollToEnd(false)
    },
    [count, isAtEnd, scheduleScrollToEnd],
  )

  const contentContainerStyle = useMemo(
    () => [styles.content, { paddingTop: padTop, paddingBottom: padBottom }],
    [padTop, padBottom],
  )

  const wrapperKeyboardStyle = useAnimatedStyle(
    () => ({
      // Keyboard controller exposes a signed translateY delta (negative while opening on iOS).
      // Keep list and sticky composer on the same motion source to avoid overlay/drift.
      transform: [{ translateY: keyboard.height.value <= 0 ? keyboard.height.value : -keyboard.height.value }],
    }),
    [keyboard.height],
  )

  const maintainVisibleContentPosition = useMemo(() => {
    if (!isBusy) return undefined
    return {
      startRenderingFromBottom: true,
      autoscrollToTopThreshold: count < 1200 ? 0.2 : undefined,
      autoscrollToBottomThreshold: count < 1200 ? 0.2 : undefined,
      animateAutoScrollToBottom: false,
    }
  }, [count, isBusy])

  const drawDistance = useMemo(() => {
    if (isBusy) return Platform.OS === "ios" ? 620 : 600
    return Platform.OS === "ios" ? 320 : 360
  }, [isBusy])
  const jumpBottom = Math.max(composerH + 14, insets.bottom + 60)

  const onListLoad = useCallback(() => {
    const firstLoad = !didInitialScroll.current
    didInitialScroll.current = true
    if (firstLoad) {
      prevCount.current = count
      if (count > 0) {
        scheduleScrollToEnd(false)
      }
    }
    addCrashBreadcrumb("chat-list:on-load", { sessionID: sessionId, count })
  }, [count, scheduleScrollToEnd, sessionId])

  useEffect(() => {
    if (!didInitialScroll.current) {
      prevCount.current = count
      return
    }
    if (prevCount.current === 0 && count > 0) {
      scheduleScrollToEnd(false)
      prevCount.current = count
      return
    }

    if (count > prevCount.current && isAtEnd.value && !userInteractingRef.current && !momentumActiveRef.current) {
      scheduleScrollToEnd(false)
    }
    prevCount.current = count
  }, [count, scheduleScrollToEnd, isAtEnd])

  return (
    <AnimatedView style={[styles.wrapper, wrapperKeyboardStyle]}>
      <FlashList
        ref={listRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        style={styles.list}
        contentContainerStyle={contentContainerStyle}
        onScroll={handleScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollBegin={onMomentumScrollBegin}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onContentSizeChange={onContentSizeChange}
        onLoad={onListLoad}
        scrollEventThrottle={16}
        drawDistance={drawDistance}
        onStartReached={onStartReached}
        onStartReachedThreshold={0.08}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        maintainVisibleContentPosition={maintainVisibleContentPosition}
        removeClippedSubviews={Platform.OS === "ios" ? FEATURE_FLAGS.iosClippedSubviews : true}
        ListFooterComponent={
          !latestAssistant && sessionFooterMeta ? (
            <DiffSummaryCard
              mode="session"
              title="Session diff"
              diffs={sessionFooterMeta.diffs}
              summary={sessionFooterMeta.summary}
              isUpdating={sessionFooterMeta.isUpdating}
              onPress={() => openDiff(sessionFooterMeta)}
            />
          ) : null
        }
      />
      {showJump ? (
        isLiquidGlassSupported ? (
          <Glass interactive style={[styles.jumpGlass, { bottom: jumpBottom }]}>
            <Pressable
              style={({ pressed }) => [styles.jumpButton, pressed && styles.jumpPressed]}
              onPress={() => {
                userInteractingRef.current = false
                momentumActiveRef.current = false
                scheduleScrollToEnd(false)
              }}
              accessibilityRole="button"
              accessibilityLabel="Scroll to bottom"
              hitSlop={8}
            >
              <FeatherIcon style={styles.jumpIcon} name="chevron-down" size={17} color={theme.colors.text} />
            </Pressable>
          </Glass>
        ) : (
          <Pressable
            style={[
              styles.jumpAbsolute,
              styles.jumpButton,
              styles.jumpButtonFallback,
              {
                bottom: jumpBottom,
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.border,
              },
            ]}
            onPress={() => {
              userInteractingRef.current = false
              momentumActiveRef.current = false
              scheduleScrollToEnd(false)
            }}
            accessibilityRole="button"
            accessibilityLabel="Scroll to bottom"
            hitSlop={8}
          >
            <FeatherIcon style={styles.jumpIcon} name="chevron-down" size={17} color={theme.colors.text} />
          </Pressable>
        )
      ) : null}
    </AnimatedView>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  diffFooterStack: {
    gap: 2,
  },
  jumpGlass: {
    position: "absolute",
    right: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: "hidden",
  },
  jumpButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  jumpAbsolute: {
    position: "absolute",
    right: 20,
  },
  jumpButtonFallback: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  jumpIcon: {
    marginTop: 0.5,
  },
  jumpPressed: {
    opacity: 0.6,
  },
})
