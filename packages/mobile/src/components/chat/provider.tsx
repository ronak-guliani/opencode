import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from "react"
import { useSharedValue, type SharedValue } from "react-native-reanimated"
import type { FlatList } from "react-native"

type ChatContextValue = {
  composerHeight: SharedValue<number>
  composerH: number
  setComposerH: (h: number) => void
  listRef: React.RefObject<FlatList | null>
  isAtEnd: SharedValue<boolean>
  messageCount: SharedValue<number>
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const composerHeight = useSharedValue(0)
  const [composerH, setComposerHState] = useState(0)
  const isAtEnd = useSharedValue(true)
  const messageCount = useSharedValue(0)
  const listRef = useRef<FlatList>(null)

  const setComposerH = useCallback((h: number) => {
    composerHeight.value = h
    setComposerHState(h)
  }, [])

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
