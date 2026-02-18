import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Platform, StyleSheet, Pressable, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native"
import type { Message } from "@opencode-ai/sdk/client"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list"
import { useMessages } from "../../store/messages"
import { useChat } from "./provider"
import { useTheme } from "../../theme"
import { UserMessage } from "./user-message"
import { AssistantMessage } from "./assistant-message"

const STREAM_AUTOFOLLOW_MIN_GROWTH = 8
const JUMP_TO_BOTTOM_DISTANCE = 320

type Props = {
  sessionId: string
  messages: Message[]
  topPadding?: number
}

export function MessagesList({ sessionId, messages, topPadding }: Props) {
  const insets = useSafeAreaInsets()
  const theme = useTheme()
  const { listRef, isAtEnd, messageCount, composerH } = useChat()
  const loadMore = useMessages((s) => s.loadMore)
  const loadingMap = useMessages((s) => s.loading)
  const exhaustedMap = useMessages((s) => s.exhausted)
  const [showJump, setShowJump] = useState(false)

  const didInitialScroll = useRef(false)
  const prevCount = useRef(0)
  const raf = useRef<number | null>(null)
  const loadingMoreRef = useRef(false)
  const userInteractingRef = useRef(false)
  const momentumActiveRef = useRef(false)
  const contentHeightRef = useRef(0)
  const jumpVisibleRef = useRef(false)

  const count = messages.length
  const latestAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "assistant") return i
    }
    return -1
  }, [messages])

  const loadingSession = loadingMap[sessionId] ?? false
  const exhaustedSession = exhaustedMap[sessionId] ?? false
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
      if (item.role === "user") return <UserMessage message={item} />
      if (item.role === "assistant") {
        return <AssistantMessage message={item} showFooter={index === latestAssistantIndex} />
      }
      return null
    },
    [latestAssistantIndex],
  )

  const keyExtractor = useCallback((item: Message) => item.id, [])

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
    if (loadingMoreRef.current || exhaustedSession) return
    loadingMoreRef.current = true
    void loadMore(sessionId)
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

  useEffect(() => {
    if (!didInitialScroll.current) {
      prevCount.current = count
      return
    }
    if (prevCount.current === 0) {
      prevCount.current = count
      return
    }
    if (count > prevCount.current && isAtEnd.value && !userInteractingRef.current) {
      scheduleScrollToEnd(false)
    }
    prevCount.current = count
  }, [count, scheduleScrollToEnd, isAtEnd])

  return (
    <View style={styles.wrapper}>
      <FlashList
        ref={listRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={(item) => item.role}
        style={styles.list}
        contentContainerStyle={contentContainerStyle}
        onScroll={handleScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollBegin={onMomentumScrollBegin}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onContentSizeChange={onContentSizeChange}
        onLoad={() => {
          didInitialScroll.current = true
        }}
        scrollEventThrottle={16}
        drawDistance={Platform.OS === "ios" ? 900 : 600}
        onStartReached={onStartReached}
        onStartReachedThreshold={0.08}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        maintainVisibleContentPosition={{
          startRenderingFromBottom: true,
          autoscrollToTopThreshold: count < 1200 ? 0.2 : undefined,
          autoscrollToBottomThreshold: count < 1200 ? 0.2 : undefined,
          animateAutoScrollToBottom: false,
        }}
        removeClippedSubviews={Platform.OS !== "ios"}
      />
      {showJump ? (
        <Pressable
          style={[
            styles.jumpButton,
            {
              bottom: Math.max(composerH + 14, insets.bottom + 60),
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
          <Text style={[styles.jumpGlyph, { color: theme.colors.text }]}>{"\u2193"}</Text>
        </Pressable>
      ) : null}
    </View>
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
  jumpButton: {
    position: "absolute",
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  jumpGlyph: {
    fontSize: 17,
    lineHeight: 18,
    fontWeight: "700",
  },
})
