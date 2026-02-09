import { useEffect } from "react"
import { View, ActivityIndicator, Text } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StyleSheet } from "react-native-unistyles"
import { MessageList } from "@/components/chat/list"
import { Composer } from "@/components/chat/composer"
import { ChatHeader } from "@/components/chat/header"
import { useSession, useSessionStatus, useMessages } from "@/api/hooks"
import { useMessageStore } from "@/store/messages"
import { useSessionStore } from "@/store/sessions"
import { getClient } from "@/api/client"
import type { Message, Part } from "@opencode-ai/sdk/client"

/**
 * Session chat view — the centerpiece of the app.
 *
 * On mount, fetches messages for this session via the SDK.
 * Renders a message list with a floating composer at the bottom.
 * SSE events keep messages/parts updated in real-time via stores.
 */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const session = useSession(id)
  const status = useSessionStatus(id)
  const messages = useMessages(id)

  useEffect(() => {
    if (!id) return
    useSessionStore.getState().select(id)
    loadMessages(id)
  }, [id])

  if (!session) {
    return (
      <View style={[styles.container, styles.loading, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ChatHeader session={session} status={status} />
      <MessageList sessionId={id} messages={messages} />
      <Composer sessionId={id} style={{ paddingBottom: insets.bottom }} />
    </View>
  )
}

async function loadMessages(sessionId: string) {
  try {
    const client = getClient()
    const res = await client.session.messages({ path: { id: sessionId } })
    if (!res.data) return

    const msgs: Message[] = []
    const parts: Record<string, Part[]> = {}

    for (const item of res.data) {
      msgs.push(item.info)
      if (item.parts.length > 0) {
        parts[item.info.id] = item.parts
      }
    }

    useMessageStore.getState().setMessages(sessionId, msgs, parts)
  } catch (err) {
    console.error("[session] Failed to load messages:", err)
  }
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loading: {
    justifyContent: "center",
    alignItems: "center",
  },
}))
