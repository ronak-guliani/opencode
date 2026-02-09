import { useCallback, useRef, useEffect } from "react"
import { View } from "react-native"
import { LegendList, type LegendListRef } from "@legendapp/list"
import { StyleSheet } from "react-native-unistyles"
import { UserMessage } from "./user-message"
import { AssistantMessage } from "./assistant-message"
import type { Message } from "@opencode-ai/sdk/client"

/**
 * Message list using LegendList for performant rendering.
 *
 * NOT inverted — we scroll to end manually for better performance
 * and natural scroll physics. New messages trigger scrollToEnd.
 */
export function MessageList({ sessionId, messages }: { sessionId: string; messages: Message[] }) {
  const ref = useRef<LegendListRef>(null)
  const count = useRef(messages.length)

  useEffect(() => {
    if (messages.length > count.current) {
      count.current = messages.length
      // Small delay to let layout settle before scrolling
      setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 50)
    }
  }, [messages.length])

  const renderItem = useCallback(({ item }: { item: Message }) => {
    if (item.role === "user") return <UserMessage message={item} />
    return <AssistantMessage message={item} />
  }, [])

  const keyExtractor = useCallback((item: Message) => item.id, [])

  if (messages.length === 0) {
    return <View style={styles.empty} />
  }

  return (
    <LegendList
      ref={ref}
      data={messages}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      estimatedItemSize={120}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      maintainScrollAtEnd
      maintainScrollAtEndThreshold={100}
    />
  )
}

const styles = StyleSheet.create((theme) => ({
  list: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xxxl,
  },
  empty: {
    flex: 1,
  },
}))
