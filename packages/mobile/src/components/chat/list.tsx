import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { StyleSheet, type LayoutChangeEvent } from "react-native"
import type { Message } from "@opencode-ai/sdk/client"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { FlashList, type ListRenderItemInfo, type ViewToken } from "@shopify/flash-list"
import { useMessages } from "../../store/messages"
import { useChat } from "./provider"
import { UserMessage } from "./user-message"
import { AssistantMessage } from "./assistant-message"

type Props = {
  sessionId: string
  messages: Message[]
  enableMarkdown?: boolean
}

export function MessagesList({ sessionId, messages, enableMarkdown = true }: Props) {
  const insets = useSafeAreaInsets()
  const { listRef, isAtEnd, messageCount, composerH } = useChat()
  const loadMore = useMessages((s) => s.loadMore)
  const loadingMap = useMessages((s) => s.loading)
  const exhaustedMap = useMessages((s) => s.exhausted)
  const didInitialScroll = useRef(false)
  const prevCount = useRef(0)
  const raf = useRef<number | null>(null)
  const contentHeightRef = useRef(0)
  const layoutHeightRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const viewableRafRef = useRef<number | null>(null)
  const [viewableMap, setViewableMap] = useState<Record<string, true>>({})
  const viewableRef = useRef<Record<string, true>>({})
  const [layoutHeight, setLayoutHeight] = useState(0)
  const [contentHeight, setContentHeight] = useState(0)

  const count = messages.length
  const loadingSession = loadingMap[sessionId] ?? false
  const exhaustedSession = exhaustedMap[sessionId] ?? false
  const topPadding = insets.top + 16

  // Blank size: when content is shorter than the visible area, pad the bottom
  // so messages appear at the top of the screen instead of being pushed down
  const composerPad = composerH || 120
  const blankSize = Math.max(0, layoutHeight - contentHeight - topPadding) + composerPad

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
      if (viewableRafRef.current !== null) {
        cancelAnimationFrame(viewableRafRef.current)
        viewableRafRef.current = null
      }
    }
  }, [])

  // Reset local scroll bookkeeping when changing sessions.
  useEffect(() => {
    didInitialScroll.current = false
    prevCount.current = 0
    viewableRef.current = {}
    setViewableMap({})
    setLayoutHeight(0)
    setContentHeight(0)
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current)
      raf.current = null
    }
  }, [sessionId])

  // Keep shared value in sync for animation hooks
  useEffect(() => {
    messageCount.value = count
  }, [count, messageCount])

  // Initial scroll to end when messages first load
  useEffect(() => {
    if (count > 0 && !didInitialScroll.current) {
      didInitialScroll.current = true
      scheduleScrollToEnd(false)
      const t1 = setTimeout(() => scheduleScrollToEnd(false), 100)
      const t2 = setTimeout(() => scheduleScrollToEnd(false), 300)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
  }, [count, scheduleScrollToEnd])

  useEffect(() => {
    loadingMoreRef.current = loadingSession
  }, [loadingSession])

  const renderItem = useCallback(
    ({ item, index, target }: ListRenderItemInfo<Message>) => {
      const isRecent = index >= count - 24
      const isViewable = !!viewableMap[item.id]
      const renderMarkdown = enableMarkdown && target === "Cell" && (isRecent || isViewable)

      if (item.role === "user") return <UserMessage message={item} index={index} />
      if (item.role === "assistant") {
        return <AssistantMessage message={item} index={index} renderMarkdown={renderMarkdown} />
      }
      return null
    },
    [count, enableMarkdown, viewableMap],
  )

  const keyExtractor = useCallback((item: Message) => item.id, [])

  const handleScroll = useCallback(
    (e: {
      nativeEvent: {
        contentOffset: { y: number }
        contentSize: { height: number }
        layoutMeasurement: { height: number }
      }
    }) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
      const distance = contentSize.height - contentOffset.y - layoutMeasurement.height
      isAtEnd.value = distance < 150

      if (
        !loadingMoreRef.current &&
        !exhaustedSession &&
        contentOffset.y < 120 &&
        contentSize.height > layoutMeasurement.height
      ) {
        loadingMoreRef.current = true
        void loadMore(sessionId)
      }
    },
    [loadMore, sessionId, exhaustedSession],
  )

  const onStartReached = useCallback(() => {
    if (loadingMoreRef.current || exhaustedSession) return
    loadingMoreRef.current = true
    void loadMore(sessionId)
  }, [loadMore, sessionId, exhaustedSession])

  const onViewableItemsChanged = useCallback(({ changed }: { changed: Array<ViewToken<Message>> }) => {
    let next = viewableRef.current
    let dirty = false
    for (const token of changed) {
      const item = token.item
      if (!item?.id) continue
      const currentlyVisible = !!next[item.id]
      if (token.isViewable && !currentlyVisible) {
        if (!dirty) next = { ...next }
        next[item.id] = true
        dirty = true
      } else if (!token.isViewable && currentlyVisible) {
        if (!dirty) next = { ...next }
        delete next[item.id]
        dirty = true
      }
    }
    if (dirty) {
      viewableRef.current = next
      if (viewableRafRef.current !== null) {
        cancelAnimationFrame(viewableRafRef.current)
      }
      viewableRafRef.current = requestAnimationFrame(() => {
        setViewableMap(viewableRef.current)
        viewableRafRef.current = null
      })
    }
  }, [])

  const handleContentSizeChange = useCallback((_w: number, h: number) => {
    if (Math.abs(h - contentHeightRef.current) > 2) {
      contentHeightRef.current = h
      setContentHeight(h)
    }
  }, [])

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height
    if (Math.abs(h - layoutHeightRef.current) > 2) {
      layoutHeightRef.current = h
      setLayoutHeight(h)
    }
  }, [])

  const contentContainerStyle = useMemo(
    () => [styles.content, { paddingTop: topPadding, paddingBottom: blankSize }],
    [topPadding, blankSize],
  )

  // Auto-scroll only when new messages arrive and user is already at end.
  useEffect(() => {
    if (count > prevCount.current && isAtEnd.value) {
      scheduleScrollToEnd(true)
    }
    prevCount.current = count
  }, [count, scheduleScrollToEnd])

  return (
    <FlashList
      ref={listRef}
      data={messages}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      style={styles.list}
      contentContainerStyle={contentContainerStyle}
      onScroll={handleScroll}
      onContentSizeChange={handleContentSizeChange}
      onLayout={handleLayout}
      scrollEventThrottle={16}
      drawDistance={600}
      onStartReached={onStartReached}
      onStartReachedThreshold={0.08}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{ itemVisiblePercentThreshold: 20 }}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      maintainVisibleContentPosition={
        count < 1200
          ? {
              autoscrollToBottomThreshold: 0.1,
              animateAutoScrollToBottom: true,
            }
          : { disabled: true }
      }
      removeClippedSubviews
    />
  )
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
  },
})
