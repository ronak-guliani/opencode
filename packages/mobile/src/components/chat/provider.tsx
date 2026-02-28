import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from "react"
import { useSharedValue, type SharedValue } from "react-native-reanimated"
import type { Message } from "@opencode-ai/sdk/client"
import type { FlashListRef } from "@shopify/flash-list"

type ChatContextValue = {
  composerHeight: SharedValue<number>
  composerH: number
  setComposerH: (h: number) => void
  listRef: React.RefObject<FlashListRef<Message> | null>
  isAtEnd: SharedValue<boolean>
  messageCount: SharedValue<number>
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const composerHeight = useSharedValue(0)
  const [composerH, setComposerHState] = useState(0)
  const isAtEnd = useSharedValue(true)
  const messageCount = useSharedValue(0)
  const listRef = useRef<FlashListRef<Message>>(null)

  const setComposerH = useCallback((h: number) => {
    const next = Math.max(0, Math.round(h))
    setComposerHState((current) => {
      // Ignore tiny layout jitter during keyboard transitions to prevent list inset flicker.
      if (Math.abs(current - next) <= 1) return current
      composerHeight.value = next
      return next
    })
  }, [composerHeight])

  return (
    <ChatContext.Provider
      value={{
        composerHeight,
        composerH,
        setComposerH,
        listRef,
        isAtEnd,
        messageCount,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error("useChat must be used within ChatProvider")
  return ctx
}
