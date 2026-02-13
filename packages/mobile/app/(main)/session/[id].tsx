import { useEffect, useRef, useState } from "react"
import { InteractionManager, View, StyleSheet } from "react-native"
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
import { markChatFirstPaint, markChatInteractionReady, markChatOpenStart } from "../../../src/perf/chat-metrics"

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const load = useMessageStore((s) => s.load)
  const select = useSessions((s) => s.select)
  const refreshRequests = useRequests((s) => s.refresh)
  const messages = useSessionMessages(id)
  const [markdownReady, setMarkdownReady] = useState(false)
  // Track which sessions have been viewed — disable fade for revisited chats
  const seen = useRef(new Set<string>())
  const wasSeen = id ? seen.current.has(id) : false

  useEffect(() => {
    if (id) {
      markChatOpenStart(id)
      select(id)
      setMarkdownReady(false)
      void load(id, { limit: 60, compact: true })
      // Mark as seen after a short delay to let initial content animate
      const timer = setTimeout(() => seen.current.add(id), 1500)
      let poll: ReturnType<typeof setInterval> | null = null
      const interactionTask = InteractionManager.runAfterInteractions(() => {
        setMarkdownReady(true)
        markChatInteractionReady(id)
        void refreshRequests()
        poll = setInterval(() => {
          void refreshRequests()
        }, 10_000)
      })
      return () => {
        clearTimeout(timer)
        interactionTask.cancel()
        if (poll) clearInterval(poll)
      }
    }
  }, [id, load, select, refreshRequests])

  useEffect(() => {
    if (!id || messages.length === 0) return
    const frame = requestAnimationFrame(() => {
      markChatFirstPaint(id, messages.length)
    })
    return () => cancelAnimationFrame(frame)
  }, [id, messages.length])

  if (!id) return null

  return (
    <ChatProvider>
      <DisableFadeProvider disabled={wasSeen}>
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
          <MessagesList sessionId={id} messages={messages} enableMarkdown={markdownReady} />
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
