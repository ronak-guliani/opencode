import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FlatList, StyleSheet, type LayoutChangeEvent } from "react-native"
import type { Message } from "@opencode-ai/sdk/client"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useChat } from "./provider"
import { UserMessage } from "./user-message"
import { AssistantMessage } from "./assistant-message"

type Props = {
  sessionId: string
  messages: Message[]
}

export function MessagesList({ sessionId, messages }: Props) {
  const insets = useSafeAreaInsets()
  const { listRef, isAtEnd, messageCount, composerH } = useChat()
  const didInitialScroll = useRef(false)
  const prevCount = useRef(0)
  const [layoutHeight, setLayoutHeight] = useState(0)
  const [contentHeight, setContentHeight] = useState(0)

  const count = messages.length
  const lastId = count > 0 ? messages[count - 1].id : undefined
  const topPadding = insets.top + 16

  // Blank size: when content is shorter than the visible area, pad the bottom
  // so messages appear at the top of the screen instead of being pushed down
  const composerPad = composerH || 120
  const blankSize = Math.max(0, layoutHeight - contentHeight - topPadding) + composerPad

  // Keep shared value in sync for animation hooks
  useEffect(() => {
    messageCount.value = count
  }, [count])

  // Initial scroll to end when messages first load
  useEffect(() => {
    if (count > 0 && !didInitialScroll.current) {
      didInitialScroll.current = true
      const scroll = () => listRef.current?.scrollToEnd({ animated: false })
      requestAnimationFrame(scroll)
      setTimeout(scroll, 100)
      setTimeout(scroll, 300)
    }
  }, [count])

  // Auto-scroll when new messages arrive (if user is at bottom)
  useEffect(() => {
    if (count > prevCount.current && isAtEnd.value) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true })
      })
    }
    prevCount.current = count
  }, [count, lastId])

  const renderItem = useCallback(({ item, index }: { item: Message; index: number }) => {
    if (item.role === "user") return <UserMessage message={item} index={index} />
    if (item.role === "assistant") return <AssistantMessage message={item} index={index} />
    return null
  }, [])

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
    },
    [],
  )

  const handleContentSizeChange = useCallback(
    (_w: number, h: number) => {
      setContentHeight(h)
      if (isAtEnd.value && count > 0) {
        listRef.current?.scrollToEnd({ animated: true })
      }
    },
    [count],
  )

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setLayoutHeight(e.nativeEvent.layout.height)
  }, [])

  const contentContainerStyle = useMemo(
    () => [styles.content, { paddingTop: topPadding, paddingBottom: blankSize }],
    [topPadding, blankSize],
  )

  return (
    <FlatList
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
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
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
