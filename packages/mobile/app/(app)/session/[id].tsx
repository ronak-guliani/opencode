import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { View, StyleSheet, PanResponder, Animated, Keyboard, Platform } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useSessionStore } from "@/store/session"
import { useProviderStore } from "@/store/provider"
import { OpenCodeClient, subscribeToEvents, type BusEvent } from "@/api/client"
import { useServerStore } from "@/store/server"
import { TerminalScreen } from "@/components/Terminal"
import { ModelSwitcher } from "@/components/ModelSwitcher"
import { ChatDrawer, CHAT_DRAWER_WIDTH } from "@/components/ChatDrawer"
import { ChatInput } from "@/components/ChatInput"
import { WelcomeScreen } from "@/components/WelcomeScreen"
import { ChatHeader } from "@/components/ChatHeader"
import { showErrorToast, showInfoToast } from "@/store/toast"
import { lightImpact, successNotification } from "@/utils/haptics"

export default function SessionScreen() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  if (!id) {
    router.replace("/")
    return null
  }
  const setCurrentSession = useSessionStore((s) => s.setCurrentSession)
  const setMessages = useSessionStore((s) => s.setMessages)
  const upsertMessage = useSessionStore((s) => s.upsertMessage)
  const updateMessageContent = useSessionStore((s) => s.updateMessageContent)
  const updateMessageReasoning = useSessionStore((s) => s.updateMessageReasoning)
  const updateMessageStatus = useSessionStore((s) => s.updateMessageStatus)
  const removeMessage = useSessionStore((s) => s.removeMessage)
  const markMessageComplete = useSessionStore((s) => s.markMessageComplete)
  const setWaitingForResponse = useSessionStore((s) => s.setWaitingForResponse)
  const setThinkingText = useSessionStore((s) => s.setThinkingText)
  const clearMessages = useSessionStore((s) => s.clearMessages)
  const getCachedMessages = useSessionStore((s) => s.getCachedMessages)
  const messages = useSessionStore((s) => s.messages)
  const sessions = useSessionStore((s) => s.sessions)
  const setSessions = useSessionStore((s) => s.setSessions)
  const { baseUrl, directory } = useServerStore()
  const fetchProviders = useProviderStore((s) => s.fetchProviders)
  const getSelectedModel = useProviderStore((s) => s.getSelectedModel)
  const getModel = useProviderStore((s) => s.getModel)
  const connected = useProviderStore((s) => s.connected)
  const [inputText, setInputText] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isRefreshingSessions, setIsRefreshingSessions] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [modelSwitcherVisible, setModelSwitcherVisible] = useState(false)

  const drawerTranslateX = useRef(new Animated.Value(-CHAT_DRAWER_WIDTH)).current
  const pendingContentRef = useRef<Map<string, string>>(new Map())
  const pendingReasoningRef = useRef<Map<string, string>>(new Map())
  const client = useMemo(() => new OpenCodeClient(baseUrl, directory), [baseUrl, directory])

  const selectedModel = getSelectedModel()
  const selectedModelInfo = selectedModel ? getModel(selectedModel.providerID, selectedModel.modelID) : null
  const modelDisplayName = selectedModelInfo?.name || selectedModel?.modelID || "Select Model"

  const hasMessages = useMemo(() => messages.some((m) => m.content && m.content.trim().length > 0), [messages])

  const startX = useRef(0)

  const openDrawer = useCallback(() => {
    setDrawerVisible(true)
    Animated.timing(drawerTranslateX, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start()
  }, [drawerTranslateX])

  const closeDrawer = useCallback(() => {
    Animated.timing(drawerTranslateX, {
      toValue: -CHAT_DRAWER_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setDrawerVisible(false)
    })
  }, [drawerTranslateX])

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        return gesture.dx > 10 && Math.abs(gesture.dy) < Math.abs(gesture.dx)
      },
      onPanResponderGrant: () => {
        // @ts-ignore - _value exists at runtime
        startX.current = drawerTranslateX._value
      },
      onPanResponderMove: (_, gesture) => {
        const x = Math.max(-CHAT_DRAWER_WIDTH, Math.min(0, startX.current + gesture.dx))
        drawerTranslateX.setValue(x)
        if (!drawerVisible && x > -CHAT_DRAWER_WIDTH + 20) {
          setDrawerVisible(true)
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 60 || gesture.vx > 0.3) {
          Animated.timing(drawerTranslateX, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start()
        } else {
          closeDrawer()
        }
      },
    }),
  ).current

  const handleCopyAllOutput = useCallback(() => {
    const assistantMessages = messages
      .filter((m) => m.role === "assistant" && m.content && m.content.trim().length > 0)
      .map((m) => m.content)
      .join("\n\n")
    return assistantMessages
  }, [messages])

  useEffect(() => {
    setIsLoading(true)
    const cached = getCachedMessages(id)
    if (cached && cached.length > 0) {
      setMessages(cached)
      setIsLoading(false)
    }

    loadSession().finally(() => setIsLoading(false))
    loadSessions()

    if (connected.length === 0) {
      fetchProviders()
    }
  }, [id])

  const loadSession = useCallback(async () => {
    const cached = getCachedMessages(id)
    if (!cached || cached.length === 0) {
      clearMessages()
    }
    pendingContentRef.current.clear()
    pendingReasoningRef.current.clear()

    try {
      const [session, serverMessages] = await Promise.all([client.getSession(id), client.getMessages(id)])
      setCurrentSession(session)
      setMessages(serverMessages)
    } catch (error) {
      showErrorToast("Failed to load session", {
        label: "Retry",
        onPress: () => loadSession(),
      })
    }
  }, [id, client, getCachedMessages, clearMessages, setCurrentSession, setMessages])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    lightImpact()
    try {
      const serverMessages = await client.getMessages(id)
      setMessages(serverMessages)
    } catch (error) {
      showErrorToast("Failed to refresh messages")
    } finally {
      setIsRefreshing(false)
    }
  }, [id, client, setMessages])

  const loadSessions = useCallback(async () => {
    try {
      const list = await client.listSessions()
      setSessions(list)
    } catch (error) {
      showErrorToast("Failed to load chat history")
    }
  }, [client, setSessions])

  const handleRefreshSessions = useCallback(async () => {
    setIsRefreshingSessions(true)
    lightImpact()
    try {
      const list = await client.listSessions()
      setSessions(list)
    } catch (error) {
      showErrorToast("Failed to refresh chat history")
    } finally {
      setIsRefreshingSessions(false)
    }
  }, [client, setSessions])

  useEffect(() => {
    let isSubscribed = true
    let wasDisconnected = false

    const unsubscribe = subscribeToEvents(
      (event: BusEvent) => {
        if (!isSubscribed) return

        if (event.type === "connection.failed") {
          showErrorToast("Lost connection to server. Please check your network.")
          return
        }

        if (event.type === "message.updated") {
          const info = event.properties?.info
          if (!info || info.sessionID !== id) return
          if (info.role === "user") return

          upsertMessage({
            id: info.id,
            sessionID: info.sessionID,
            role: info.role,
            content: pendingContentRef.current.get(info.id) || "",
            time: info.time?.created || Date.now(),
            isComplete: false,
          })

          setWaitingForResponse(true)
        }

        if (event.type === "message.part.updated") {
          const part = event.properties?.part
          if (!part) return

          if (part.type === "text" && part.text) {
            pendingContentRef.current.set(part.messageID, part.text)
            updateMessageContent(part.messageID, part.text)
            setThinkingText(null)
          }

          if (part.type === "reasoning" && part.text) {
            pendingReasoningRef.current.set(part.messageID, part.text)
            updateMessageReasoning(part.messageID, part.text)
            setThinkingText(part.text)
          }
        }

        if (event.type === "session.status") {
          if (event.properties?.sessionID !== id) return
          const status = event.properties?.status?.type

          if (status === "idle") {
            setIsSending(false)
            setWaitingForResponse(false)
            setThinkingText(null)
            const currentMessages = useSessionStore.getState().messages
            const hadIncompleteMessages = currentMessages.some((m) => !m.isComplete)
            currentMessages.forEach((m) => {
              if (!m.isComplete) markMessageComplete(m.id)
            })
            if (hadIncompleteMessages) {
              successNotification()
            }
          }
        }
      },
      (connected) => {
        if (!isSubscribed) return
        if (!connected && !wasDisconnected) {
          wasDisconnected = true
          showInfoToast("Reconnecting to server...")
        } else if (connected && wasDisconnected) {
          wasDisconnected = false
          showInfoToast("Connection restored")
        }
      },
    )

    return () => {
      isSubscribed = false
      unsubscribe()
      pendingContentRef.current.clear()
      pendingReasoningRef.current.clear()
    }
  }, [
    id,
    upsertMessage,
    updateMessageContent,
    updateMessageReasoning,
    markMessageComplete,
    setWaitingForResponse,
    setThinkingText,
  ])

  const handleSendMessage = useCallback(
    async (text?: string, retryMessageId?: string) => {
      const messageText = (text || inputText).trim()
      if (!messageText || isSending) return

      const model = getSelectedModel()
      if (!model) return

      lightImpact()
      setInputText("")

      let messageId = retryMessageId
      if (!messageId) {
        messageId = `optimistic-${Date.now()}`
        upsertMessage({
          id: messageId,
          sessionID: id,
          role: "user",
          content: messageText,
          time: Date.now(),
          isComplete: true,
          status: "sending",
        })
      } else {
        updateMessageStatus(messageId, "sending")
      }

      setIsSending(true)
      setWaitingForResponse(true)
      try {
        await client.sendMessage(id, messageText, model)
        updateMessageStatus(messageId, "sent")
      } catch (error) {
        updateMessageStatus(messageId, "failed")
        setWaitingForResponse(false)
        showErrorToast("Failed to send message")
      } finally {
        setIsSending(false)
      }
    },
    [inputText, isSending, id, getSelectedModel, upsertMessage, updateMessageStatus, setWaitingForResponse, client],
  )

  const handleRetryMessage = useCallback(
    (message: { id: string; content: string }) => {
      handleSendMessage(message.content, message.id)
    },
    [handleSendMessage],
  )

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (sessionId !== id) {
        router.replace(`/session/${sessionId}`)
      }
    },
    [id, router],
  )

  const handleNewChat = useCallback(async () => {
    try {
      const newSession = await client.createSession()
      const currentSessions = useSessionStore.getState().sessions
      setSessions([newSession, ...currentSessions])
      setCurrentSession(newSession)
      router.replace(`/session/${newSession.id}`)
    } catch (error) {
      showErrorToast("Failed to create new chat")
    }
  }, [client, setSessions, setCurrentSession, router])

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      try {
        const currentSessions = useSessionStore.getState().sessions
        const remaining = currentSessions.filter((s) => s.id !== sessionId)
        setSessions(remaining)

        if (sessionId === id) {
          if (remaining.length > 0) {
            const nextSession = remaining[0]
            router.replace(`/session/${nextSession.id}`)
          } else {
            const newSession = await client.createSession()
            setSessions([newSession])
            setCurrentSession(newSession)
            router.replace(`/session/${newSession.id}`)
          }
        }
      } catch (error) {
        showErrorToast("Failed to delete chat")
      }
    },
    [id, setSessions, setCurrentSession, client, router],
  )

  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height)
    })
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0)
    })

    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  const handleSuggestionSelect = useCallback((suggestion: string) => {
    setInputText(suggestion)
  }, [])

  return (
    <View
      style={[styles.container, { paddingTop: insets.top, paddingBottom: keyboardHeight }]}
      {...panResponder.panHandlers}
    >
      <ChatHeader
        onMenuPress={openDrawer}
        onNewChatPress={handleNewChat}
        onCopyAll={hasMessages ? handleCopyAllOutput : undefined}
      />

      {hasMessages || isLoading ? (
        <TerminalScreen onRetryMessage={handleRetryMessage} onRefresh={handleRefresh} isRefreshing={isRefreshing} />
      ) : (
        <WelcomeScreen onSuggestionSelect={handleSuggestionSelect} />
      )}

      <ChatInput
        value={inputText}
        onChangeText={setInputText}
        onSend={() => handleSendMessage()}
        onModelPress={() => setModelSwitcherVisible(true)}
        modelName={modelDisplayName}
        disabled={isSending}
      />

      <ChatDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        sessions={sessions}
        currentSessionId={id}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRefresh={handleRefreshSessions}
        isRefreshing={isRefreshingSessions}
        translateX={drawerTranslateX}
      />

      <ModelSwitcher
        visible={modelSwitcherVisible}
        onClose={() => setModelSwitcherVisible(false)}
        showTrigger={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
})
