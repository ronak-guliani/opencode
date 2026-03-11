import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native"
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
import { normalizeDiffList } from "../../features/diff/normalize"
import { synthesizeSessionDiff } from "../../features/diff/synthetic"
import { addCrashBreadcrumb } from "../../perf/crash-breadcrumbs"
import { useSessionDiffSummary, useSessionPartsMap } from "../../api/hooks"
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
const OLDER_PREFETCH_OFFSET_PX = 1600
const OLDER_PREFETCH_THROTTLE_MS = 320
const TOP_LOAD_LOCK_OFFSET_PX = 10
const SYNTHETIC_FALLBACK_MAX_MESSAGES = 120
const TURN_DIFF_SYNTHESIS_MAX_TURNS = 18
const TURN_DIFF_SYNTHESIS_LARGE_SESSION_CUTOFF = 220
const TURN_DIFF_WINDOW_MAX_MESSAGES = 320
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

export function MessagesList({ sessionId, messages, topPadding }: Props) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const theme = useTheme()
  const keyboard = useReanimatedKeyboardAnimation()
  const { listRef, isAtEnd, messageCount, composerH } = useChat()
  const loadMore = useMessages((s) => s.loadMore)
  const loadingSession = useMessages(useCallback((s) => s.loading[sessionId] ?? false, [sessionId]))
  const exhaustedSession = useMessages(useCallback((s) => s.exhausted[sessionId] ?? false, [sessionId]))
  const session = useSessions(useCallback((s) => s.sessionByID[sessionId], [sessionId]))
  const isBusy = useSessions(useCallback((s) => s.statuses[sessionId]?.type === "busy", [sessionId]))
  const fetchSessionDiff = useDiffs((s) => s.fetchSessionDiff)
  const sessionDiffs = useDiffs(useCallback((s) => s.bySession[sessionId] ?? EMPTY_DIFFS, [sessionId]))
  const sessionDiffLoading = useDiffs(useCallback((s) => s.loading[sessionId] ?? false, [sessionId]))
  const sessionDiffFetchedAt = useDiffs(useCallback((s) => s.fetchedAt[sessionId] ?? 0, [sessionId]))
  const partsByMessage = useSessionPartsMap(sessionId)
  const [showJump, setShowJump] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)

  const didInitialScroll = useRef(false)
  const initialBottomSyncPendingRef = useRef(true)
  const prevCount = useRef(0)
  const raf = useRef<number | null>(null)
  const bottomSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadingMoreRef = useRef(false)
  const loadingOlderVisibleRef = useRef(false)
  const userInteractingRef = useRef(false)
  const momentumActiveRef = useRef(false)
  const contentHeightRef = useRef(0)
  const lastScrollOffsetYRef = useRef(0)
  const topLockDuringLoadRef = useRef(false)
  const jumpVisibleRef = useRef(false)
  const lastOlderPrefetchAtRef = useRef(0)
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
  const olderPrefetchOffset = useMemo(() => {
    if (count >= 2000) return 2800
    if (count >= 1200) return 2200
    if (count >= 600) return 1800
    return OLDER_PREFETCH_OFFSET_PX
  }, [count])
  const latestAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const candidate = messages[i]
      if (candidate && candidate.role === "assistant") return i
    }
    return -1
  }, [messages])
  const apiDiffs = useMemo(() => normalizeDiffList(sessionDiffs, EMPTY_DIFFS), [sessionDiffs])
  const hasRenderableSessionDiffs = apiDiffs.length > 0
  const includeSyntheticFallback =
    !isBusy && !hasRenderableSessionDiffs && messages.length > 0 && messages.length <= SYNTHETIC_FALLBACK_MAX_MESSAGES
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
  const latestAssistantID =
    latestAssistant && latestAssistant.role === "assistant" && typeof latestAssistant.id === "string" ? latestAssistant.id : ""
  const latestAssistantCreatedAt = useMemo(() => {
    if (!latestAssistant || latestAssistant.role !== "assistant") return 0
    return Math.max(0, asNumber(latestAssistant.time?.created))
  }, [latestAssistant])

  const turnDiffMessages = useMemo(
    () => (messages.length > TURN_DIFF_WINDOW_MAX_MESSAGES ? messages.slice(-TURN_DIFF_WINDOW_MAX_MESSAGES) : messages),
    [messages],
  )

  const assistantMessagesByParentID = useMemo(() => {
    const result = new Map<string, Message[]>()
    for (const message of turnDiffMessages) {
      if (!message || message.role !== "assistant") continue
      const parentID = asString((message as { parentID?: unknown }).parentID)
      if (!parentID) continue
      const existing = result.get(parentID)
      if (existing) existing.push(message)
      else result.set(parentID, [message])
    }
    return result
  }, [turnDiffMessages])

  const userMessagesByID = useMemo(() => {
    const result = new Map<string, Message>()
    for (const message of turnDiffMessages) {
      if (!message || message.role !== "user") continue
      if (typeof message.id !== "string" || !message.id) continue
      result.set(message.id, message)
    }
    return result
  }, [turnDiffMessages])

  const userSummaryDiffsByID = useMemo(() => {
    const result = new Map<string, SessionFileDiff[]>()
    for (const message of turnDiffMessages) {
      if (!message || message.role !== "user") continue
      if (typeof message.id !== "string" || !message.id) continue
      const summaryDiffs = (message as { summary?: { diffs?: unknown } }).summary?.diffs
      result.set(message.id, normalizeDiffList(summaryDiffs))
    }
    return result
  }, [turnDiffMessages])

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
    const entries = Array.from(assistantMessagesByParentID.entries())
    const maxTurns = messages.length > TURN_DIFF_SYNTHESIS_LARGE_SESSION_CUTOFF ? 1 : TURN_DIFF_SYNTHESIS_MAX_TURNS
    const start = Math.max(0, entries.length - maxTurns)

    for (let i = start; i < entries.length; i += 1) {
      const [parentID, assistants] = entries[i]
      if (!parentID || assistants.length === 0) continue
      const targetAssistant = assistants[assistants.length - 1]
      if (!targetAssistant || typeof targetAssistant.id !== "string" || !targetAssistant.id) continue

      const summaryDiffs = userSummaryDiffsByID.get(parentID) ?? EMPTY_DIFFS
      let syntheticDiffs = EMPTY_DIFFS
      const userMessage = userMessagesByID.get(parentID)
      if (userMessage && (summaryDiffs.length === 0 || targetAssistant.id === latestAssistantID)) {
        try {
          syntheticDiffs = normalizeDiffList(synthesizeSessionDiff([userMessage, ...assistants], partsByMessage))
        } catch {
          syntheticDiffs = EMPTY_DIFFS
        }
      }

      const turnDiffs = resolveTurnDiffs(summaryDiffs, syntheticDiffs)
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
  }, [assistantMessagesByParentID, isBusy, latestAssistantID, messages.length, partsByMessage, userMessagesByID, userSummaryDiffsByID])

  const diffFootersByAssistantID = useMemo(() => {
    return resolveFootersByAssistant({
      turnFooterByAssistantID,
      latestAssistantID,
      sessionFooterMeta,
    })
  }, [latestAssistantID, sessionFooterMeta, turnFooterByAssistantID])

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
      if (bottomSettleTimerRef.current) {
        clearTimeout(bottomSettleTimerRef.current)
        bottomSettleTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    addCrashBreadcrumb("chat-list:session-change", { sessionID: sessionId })
    malformedMessageKeysRef.current.clear()
    didInitialScroll.current = false
    initialBottomSyncPendingRef.current = true
    prevCount.current = 0
    userInteractingRef.current = false
    momentumActiveRef.current = false
    contentHeightRef.current = 0
    lastScrollOffsetYRef.current = 0
    topLockDuringLoadRef.current = false
    jumpVisibleRef.current = false
    loadingOlderVisibleRef.current = false
    lastOlderPrefetchAtRef.current = 0
    setShowJump(false)
    setLoadingOlder(false)
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current)
      raf.current = null
    }
    if (bottomSettleTimerRef.current) {
      clearTimeout(bottomSettleTimerRef.current)
      bottomSettleTimerRef.current = null
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
                      onOpenDiff={() => openDiff(meta)}
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

  const triggerLoadMore = useCallback(
    function triggerLoadMoreImpl(showLoader: boolean, allowFollowup = true) {
      if (!didInitialScroll.current) return
      if (loadingMoreRef.current || exhaustedSession) return
      loadingMoreRef.current = true
      topLockDuringLoadRef.current = false
      loadingOlderVisibleRef.current = showLoader
      if (showLoader) setLoadingOlder(true)
      void loadMore(sessionId).finally(() => {
        loadingMoreRef.current = false
        topLockDuringLoadRef.current = false
        if (allowFollowup && !exhaustedSession && lastScrollOffsetYRef.current <= olderPrefetchOffset * 0.45) {
          // If the user is still very close to the top, fetch one extra page to avoid blank gaps.
          triggerLoadMoreImpl(true, false)
          return
        }
        if (loadingOlderVisibleRef.current && !loadingMoreRef.current) {
          loadingOlderVisibleRef.current = false
          setLoadingOlder(false)
        }
      })
    },
    [exhaustedSession, loadMore, olderPrefetchOffset, sessionId],
  )

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
      lastScrollOffsetYRef.current = contentOffset.y
      if (loadingMoreRef.current && contentOffset.y < TOP_LOAD_LOCK_OFFSET_PX) {
        if (!topLockDuringLoadRef.current) {
          topLockDuringLoadRef.current = true
          listRef.current?.scrollToOffset({ offset: TOP_LOAD_LOCK_OFFSET_PX, animated: false })
        }
      }
      const distance = contentSize.height - contentOffset.y - layoutMeasurement.height
      isAtEnd.value = distance < 150
      const shouldShow = distance > JUMP_TO_BOTTOM_DISTANCE
      if (jumpVisibleRef.current !== shouldShow) {
        jumpVisibleRef.current = shouldShow
        setShowJump(shouldShow)
      }

      if (
        contentOffset.y <= olderPrefetchOffset &&
        didInitialScroll.current &&
        !loadingMoreRef.current &&
        !exhaustedSession
      ) {
        const now = Date.now()
        if (now - lastOlderPrefetchAtRef.current >= OLDER_PREFETCH_THROTTLE_MS) {
          lastOlderPrefetchAtRef.current = now
          triggerLoadMore(true)
        }
      }
    },
    [exhaustedSession, isAtEnd, olderPrefetchOffset, triggerLoadMore],
  )

  const onStartReached = useCallback(() => {
    const now = Date.now()
    if (now - lastOlderPrefetchAtRef.current < OLDER_PREFETCH_THROTTLE_MS) return
    lastOlderPrefetchAtRef.current = now
    triggerLoadMore(true)
  }, [triggerLoadMore])

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
      if (initialBottomSyncPendingRef.current && didInitialScroll.current && count > 0) {
        initialBottomSyncPendingRef.current = false
        scheduleScrollToEnd(false)
        if (bottomSettleTimerRef.current) clearTimeout(bottomSettleTimerRef.current)
        bottomSettleTimerRef.current = setTimeout(() => {
          bottomSettleTimerRef.current = null
          scheduleScrollToEnd(false)
        }, 42)
      }

      if (!isBusy) return
      if (!didInitialScroll.current) return
      if (previousHeight <= 0) return
      if (height - previousHeight < STREAM_AUTOFOLLOW_MIN_GROWTH) return
      if (loadingMoreRef.current) return
      if (count > prevCount.current) return
      if (!isAtEnd.value) return
      if (userInteractingRef.current || momentumActiveRef.current) return

      scheduleScrollToEnd(false)
    },
    [count, isAtEnd, isBusy, scheduleScrollToEnd],
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
    if (count >= 2400) return Platform.OS === "ios" ? 1800 : 1700
    if (count >= 1200) return Platform.OS === "ios" ? 1400 : 1320
    if (count >= 500) return Platform.OS === "ios" ? 1000 : 940
    if (isBusy) return Platform.OS === "ios" ? 760 : 720
    return Platform.OS === "ios" ? 460 : 500
  }, [count, isBusy])
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

  const listHeader = useMemo(() => {
    if (exhaustedSession || !loadingOlder) return null
    return (
      <View
        style={[
          styles.olderLoadingHeader,
          {
            borderColor: theme.colors.borderSubtle,
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
        <Text style={[styles.olderLoadingText, { color: theme.colors.textSecondary }]}>Loading older messages...</Text>
      </View>
    )
  }, [exhaustedSession, loadingOlder, theme.colors.background, theme.colors.borderSubtle, theme.colors.textSecondary])

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

    if (isBusy && count > prevCount.current && isAtEnd.value && !userInteractingRef.current && !momentumActiveRef.current) {
      scheduleScrollToEnd(false)
    }
    prevCount.current = count
  }, [count, isAtEnd, isBusy, scheduleScrollToEnd])

  return (
    <AnimatedView style={[styles.wrapper, wrapperKeyboardStyle]}>
      <FlashList
        ref={listRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        style={[styles.list, { backgroundColor: theme.colors.background }]}
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
        onStartReachedThreshold={0.7}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        maintainVisibleContentPosition={maintainVisibleContentPosition}
        removeClippedSubviews={Platform.OS === "ios" ? false : true}
        ListHeaderComponent={listHeader}
        ListFooterComponent={
          !latestAssistant && sessionFooterMeta ? (
            <DiffSummaryCard
              mode="session"
              title="Session diff"
              diffs={sessionFooterMeta.diffs}
              summary={sessionFooterMeta.summary}
              isUpdating={sessionFooterMeta.isUpdating}
              onOpenDiff={() => openDiff(sessionFooterMeta)}
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
  olderLoadingHeader: {
    alignSelf: "center",
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 30,
  },
  olderLoadingText: {
    fontSize: 12,
    fontWeight: "500",
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
