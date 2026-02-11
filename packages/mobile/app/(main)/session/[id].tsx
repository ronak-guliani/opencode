import { useEffect, useRef } from "react"
import { View, StyleSheet } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useMessages as useMessageStore } from "../../../src/store/messages"
import { useSessions } from "../../../src/store/sessions"
import { useRequests } from "../../../src/store/requests"
import { useSessionMessages } from "../../../src/api/hooks"
import { useTheme } from "../../../src/theme"
import { ChatProvider } from "../../../src/components/chat/provider"
import { MessagesList } from "../../../src/components/chat/list"
import { Composer } from "../../../src/components/chat/composer"
import { RequestBanner } from "../../../src/components/chat/request-banner"
import { DisableFadeProvider } from "../../../src/animation"

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const load = useMessageStore((s) => s.load)
  const select = useSessions((s) => s.select)
  const refreshRequests = useRequests((s) => s.refresh)
  const messages = useSessionMessages(id)
  // Track which sessions have been viewed — disable fade for revisited chats
  const seen = useRef(new Set<string>())
  const wasSeen = id ? seen.current.has(id) : false

  useEffect(() => {
    if (id) {
      select(id)
      load(id)
      refreshRequests()
      // Mark as seen after a short delay to let initial content animate
      const timer = setTimeout(() => seen.current.add(id), 2000)
      const poll = setInterval(() => {
        refreshRequests()
      }, 5000)
      return () => {
        clearTimeout(timer)
        clearInterval(poll)
      }
    }
  }, [id, load, select, refreshRequests])

  if (!id) return null

  return (
    <ChatProvider>
      <DisableFadeProvider disabled={wasSeen}>
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
          <MessagesList sessionId={id} messages={messages} />
          <RequestBanner sessionId={id} />
          <Composer sessionId={id} />
        </View>
      </DisableFadeProvider>
    </ChatProvider>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})
