import { useCallback, useEffect, useMemo, useRef } from "react"
import { Platform, StyleSheet, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native"
import type { Message } from "@opencode-ai/sdk/client"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list"
import { useMessages } from "../../store/messages"
import { useChat } from "./provider"
import { UserMessage } from "./user-message"
import { AssistantMessage } from "./assistant-message"

const STREAM_AUTOFOLLOW_MIN_GROWTH = 8

type Props = {
  sessionId: string
  messages: Message[]
  topPadding?: number
}

export function MessagesList({ sessionId, messages, topPadding }: Props) {
  const insets = useSafeAreaInsets()
  const { listRef, isAtEnd, messageCount, composerH } = useChat()
  const loadMore = useMessages((s) => s.loadMore)
  const loadingMap = useMessages((s) => s.loading)
  const exhaustedMap = useMessages((s) => s.exhausted)

  const didInitialScroll = useRef(false)
  const prevCount = useRef(0)
  const raf = useRef<number | null>(null)
  const loadingMoreRef = useRef(false)
  const userInteractingRef = useRef(false)
  const momentumActiveRef = useRef(false)
  const contentHeightRef = useRef(0)

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
  const padBottom = Math.max(composerH, 120 + insets.bottom)

  const scheduleScrollToEnd = useCallback(
    (animated: boolean) => {
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current)
        raf.current = null
      }
      raf.current = requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated })
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
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current)
      raf.current = null
    }
  }, [sessionId])

  useEffect(() => {
    messageCount.value = count
  }, [count, messageCount])

  useEffect(() => {
    if (count > 0 && !didInitialScroll.current) {
      didInitialScroll.current = true
      scheduleScrollToEnd(false)
    }
  }, [count, scheduleScrollToEnd])

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
    if (count > prevCount.current && isAtEnd.value && !userInteractingRef.current) {
      scheduleScrollToEnd(true)
    }
    prevCount.current = count
  }, [count, scheduleScrollToEnd, isAtEnd])

  return (
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
      scrollEventThrottle={16}
      drawDistance={Platform.OS === "ios" ? 900 : 600}
      onStartReached={onStartReached}
      onStartReachedThreshold={0.08}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      maintainVisibleContentPosition={
        count < 1200
          ? {
              autoscrollToTopThreshold: 0.2,
            }
          : { disabled: true }
      }
      removeClippedSubviews={Platform.OS !== "ios"}
    />
  )
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
})
