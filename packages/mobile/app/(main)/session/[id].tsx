import { useEffect, useRef } from "react"
import { View, StyleSheet } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useMessages as useMessageStore } from "../../../src/store/messages"
import { useSessionMessages } from "../../../src/api/hooks"
import { useTheme } from "../../../src/theme"
import { ChatProvider } from "../../../src/components/chat/provider"
import { MessagesList } from "../../../src/components/chat/list"
import { Composer } from "../../../src/components/chat/composer"
import { DisableFadeProvider } from "../../../src/animation"

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const load = useMessageStore((s) => s.load)
  const messages = useSessionMessages(id)
  // Track which sessions have been viewed — disable fade for revisited chats
  const seen = useRef(new Set<string>())
  const wasSeen = id ? seen.current.has(id) : false

  useEffect(() => {
    if (id) {
      load(id)
      // Mark as seen after a short delay to let initial content animate
      const timer = setTimeout(() => seen.current.add(id), 2000)
      return () => clearTimeout(timer)
    }
  }, [id])

  if (!id) return null

  return (
    <ChatProvider>
      <DisableFadeProvider disabled={wasSeen}>
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
          <MessagesList sessionId={id} messages={messages} />
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
