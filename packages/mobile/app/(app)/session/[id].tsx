import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { View, StyleSheet, PanResponder, Animated, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useSessionStore } from "@/store/session"
import { useProviderStore } from "@/store/provider"
import { OpenCodeClient, subscribeToEvents, type BusEvent } from "@/api/client"
import { useServerStore } from "@/store/server"
import { TerminalScreen } from "@/components/Terminal"
import { ModelSwitcher } from "@/components/ModelSwitcher"
import { ChatDrawer, getDrawerWidth } from "@/components/ChatDrawer"
import { ChatInput } from "@/components/ChatInput"
import { WelcomeScreen } from "@/components/WelcomeScreen"
import { ChatHeader } from "@/components/ChatHeader"
import { KeyboardCompatibleView } from "@/components/KeyboardCompatibleView"
import { showErrorToast, showInfoToast } from "@/store/toast"
import { lightImpact, successNotification } from "@/utils/haptics"

// Access store actions directly - these are stable references that don't need reactive subscriptions
const sessionActions = {
  setCurrentSession: useSessionStore.getState().setCurrentSession,
  setMessages: useSessionStore.getState().setMessages,
  upsertMessage: useSessionStore.getState().upsertMessage,
  updateMessageContent: useSessionStore.getState().updateMessageContent,
  updateMessageReasoning: useSessionStore.getState().updateMessageReasoning,
  updateMessageStatus: useSessionStore.getState().updateMessageStatus,
  markMessageComplete: useSessionStore.getState().markMessageComplete,
  setWaitingForResponse: useSessionStore.getState().setWaitingForResponse,
  setThinkingText: useSessionStore.getState().setThinkingText,
  clearMessages: useSessionStore.getState().clearMessages,
  getCachedMessages: useSessionStore.getState().getCachedMessages,
  setSessions: useSessionStore.getState().setSessions,
}

const providerActions = {
  fetchProviders: useProviderStore.getState().fetchProviders,
  getSelectedModel: useProviderStore.getState().getSelectedModel,
  getModel: useProviderStore.getState().getModel,
}

export default function SessionScreen() {
  const insets = useSafeAreaInsets()
  const { width: screenWidth } = useWindowDimensions()
  const drawerWidth = getDrawerWidth(screenWidth)
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  if (!id) {
    router.replace("/")
    return null
  }

  // Only subscribe to reactive state that actually changes and affects rendering
  const messages = useSessionStore((s) => s.messages)
  const sessions = useSessionStore((s) => s.sessions)
  const connected = useProviderStore((s) => s.connected)

  const { baseUrl, directory } = useServerStore()

  const [inputText, setInputText] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isRefreshingSessions, setIsRefreshingSessions] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [modelSwitcherVisible, setModelSwitcherVisible] = useState(false)

  const drawerProgress = useRef(new Animated.Value(0)).current
  const pendingContentRef = useRef<Map<string, string>>(new Map())
  const pendingReasoningRef = useRef<Map<string, string>>(new Map())
  const drawerWidthRef = useRef(drawerWidth)
  drawerWidthRef.current = drawerWidth

  const client = useMemo(() => new OpenCodeClient(baseUrl, directory), [baseUrl, directory])

  const selectedModel = providerActions.getSelectedModel()
  const selectedModelInfo = selectedModel
    ? providerActions.getModel(selectedModel.providerID, selectedModel.modelID)
    : null
  const modelDisplayName = selectedModelInfo?.name || selectedModel?.modelID || "Select Model"

  const hasMessages = useMemo(() => messages.some((m) => m.content && m.content.trim().length > 0), [messages])

  const startProgress = useRef(0)

  const openDrawer = useCallback(() => {
    Animated.spring(drawerProgress, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 30,
    }).start()
  }, [drawerProgress])

  const closeDrawer = useCallback(() => {
    Animated.spring(drawerProgress, {
      toValue: 0,
      useNativeDriver: true,
      tension: 300,
      friction: 30,
    }).start()
  }, [drawerProgress])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          // @ts-ignore - _value exists at runtime
          const isDrawerOpen = drawerProgress._value > 0.5
          if (isDrawerOpen) {
            return gesture.dx < -10 && Math.abs(gesture.dy) < Math.abs(gesture.dx)
          }
          return gesture.dx > 15 && Math.abs(gesture.dy) < Math.abs(gesture.dx) && gesture.moveX < 40
        },
        onPanResponderGrant: () => {
          // @ts-ignore - _value exists at runtime
          startProgress.current = drawerProgress._value
        },
        onPanResponderMove: (_, gesture) => {
          const progress = Math.max(0, Math.min(1, startProgress.current + gesture.dx / drawerWidthRef.current))
          drawerProgress.setValue(progress)
        },
        onPanResponderRelease: (_, gesture) => {
          // @ts-ignore - _value exists at runtime
          const currentProgress = drawerProgress._value
          if (gesture.vx > 0.5 || (currentProgress > 0.3 && gesture.vx > -0.5)) {
            openDrawer()
          } else if (gesture.vx < -0.5 || currentProgress < 0.7) {
            closeDrawer()
          } else if (currentProgress > 0.5) {
            openDrawer()
          } else {
            closeDrawer()
          }
        },
      }),
    [drawerProgress, openDrawer, closeDrawer],
  )

  const mainTranslateX = useMemo(
    () =>
      drawerProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, drawerWidth],
      }),
    [drawerProgress, drawerWidth],
  )

  const mainScale = useMemo(
    () =>
      drawerProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.92],
      }),
    [drawerProgress],
  )

  const mainBorderRadius = useMemo(
    () =>
      drawerProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 20],
      }),
    [drawerProgress],
  )

  const handleCopyAllOutput = useCallback(() => {
    const assistantMessages = messages
      .filter((m) => m.role === "assistant" && m.content && m.content.trim().length > 0)
      .map((m) => m.content)
      .join("\n\n")
    return assistantMessages
  }, [messages])

  useEffect(() => {
    setIsLoading(true)
    const cached = sessionActions.getCachedMessages(id)
    if (cached) {
      sessionActions.setMessages(cached)
    } else {
      sessionActions.clearMessages()
    }

    loadSession().finally(() => setIsLoading(false))
    loadSessions()

    if (connected.length === 0) {
      providerActions.fetchProviders()
    }
  }, [id])

  const loadSession = useCallback(async () => {
    pendingContentRef.current.clear()
    pendingReasoningRef.current.clear()

    try {
      const [session, serverMessages] = await Promise.all([client.getSession(id), client.getMessages(id)])
      sessionActions.setCurrentSession(session)
      sessionActions.setMessages(serverMessages)
    } catch (error) {
      showErrorToast("Failed to load session", {
        label: "Retry",
        onPress: () => loadSession(),
      })
    }
  }, [id, client])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    lightImpact()
    try {
      const serverMessages = await client.getMessages(id)
      sessionActions.setMessages(serverMessages)
    } catch (error) {
      showErrorToast("Failed to refresh messages")
    } finally {
      setIsRefreshing(false)
    }
  }, [id, client])

  const loadSessions = useCallback(async () => {
    try {
      const list = await client.listSessions()
      sessionActions.setSessions(list)
    } catch (error) {
      showErrorToast("Failed to load chat history")
    }
  }, [client])

  const handleRefreshSessions = useCallback(async () => {
    setIsRefreshingSessions(true)
    lightImpact()
    try {
      const list = await client.listSessions()
      sessionActions.setSessions(list)
    } catch (error) {
      showErrorToast("Failed to refresh chat history")
    } finally {
      setIsRefreshingSessions(false)
    }
  }, [client])

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

          sessionActions.upsertMessage({
            id: info.id,
            sessionID: info.sessionID,
            role: info.role,
            content: pendingContentRef.current.get(info.id) || "",
            time: info.time?.created || Date.now(),
            isComplete: false,
          })

          sessionActions.setWaitingForResponse(true)
        }

        if (event.type === "message.part.updated") {
          const part = event.properties?.part
          if (!part) return

          if (part.type === "text" && part.text) {
            pendingContentRef.current.set(part.messageID, part.text)
            sessionActions.updateMessageContent(part.messageID, part.text)
            sessionActions.setThinkingText(null)
          }

          if (part.type === "reasoning" && part.text) {
            pendingReasoningRef.current.set(part.messageID, part.text)
            sessionActions.updateMessageReasoning(part.messageID, part.text)
            sessionActions.setThinkingText(part.text)
          }
        }

        if (event.type === "session.status") {
          if (event.properties?.sessionID !== id) return
          const status = event.properties?.status?.type

          if (status === "idle") {
            setIsSending(false)
            sessionActions.setWaitingForResponse(false)
            sessionActions.setThinkingText(null)
            const currentMessages = useSessionStore.getState().messages
            const hadIncompleteMessages = currentMessages.some((m) => !m.isComplete)
            currentMessages.forEach((m) => {
              if (!m.isComplete) sessionActions.markMessageComplete(m.id)
            })
            if (hadIncompleteMessages) {
              successNotification()
            }
          }
        }
      },
      (isConnected) => {
        if (!isSubscribed) return
        if (!isConnected && !wasDisconnected) {
          wasDisconnected = true
          showInfoToast("Reconnecting to server...")
        } else if (isConnected && wasDisconnected) {
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
  }, [id])

  const handleSendMessage = useCallback(
    async (text?: string, retryMessageId?: string) => {
      const messageText = (text || inputText).trim()
      if (!messageText || isSending) return

      const model = providerActions.getSelectedModel()
      if (!model) return

      lightImpact()
      setInputText("")

      let messageId = retryMessageId
      if (!messageId) {
        messageId = `optimistic-${Date.now()}`
        sessionActions.upsertMessage({
          id: messageId,
          sessionID: id,
          role: "user",
          content: messageText,
          time: Date.now(),
          isComplete: true,
          status: "sending",
        })
      } else {
        sessionActions.updateMessageStatus(messageId, "sending")
      }

      setIsSending(true)
      sessionActions.setWaitingForResponse(true)
      try {
        await client.sendMessage(id, messageText, model)
        sessionActions.updateMessageStatus(messageId, "sent")
      } catch (error) {
        sessionActions.updateMessageStatus(messageId, "failed")
        sessionActions.setWaitingForResponse(false)
        showErrorToast("Failed to send message")
      } finally {
        setIsSending(false)
      }
    },
    [inputText, isSending, id, client],
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
      sessionActions.setSessions([newSession, ...currentSessions])
      sessionActions.setCurrentSession(newSession)
      router.replace(`/session/${newSession.id}`)
    } catch (error) {
      showErrorToast("Failed to create new chat")
    }
  }, [client, router])

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      try {
        const currentSessions = useSessionStore.getState().sessions
        const remaining = currentSessions.filter((s) => s.id !== sessionId)
        sessionActions.setSessions(remaining)

        if (sessionId === id) {
          if (remaining.length > 0) {
            const nextSession = remaining[0]
            router.replace(`/session/${nextSession.id}`)
          } else {
            const newSession = await client.createSession()
            sessionActions.setSessions([newSession])
            sessionActions.setCurrentSession(newSession)
            router.replace(`/session/${newSession.id}`)
          }
        }
      } catch (error) {
        showErrorToast("Failed to delete chat")
      }
    },
    [id, client, router],
  )

  const handleSettingsPress = useCallback(() => {
    router.push("/settings")
  }, [router])

  const handleSuggestionSelect = useCallback((suggestion: string) => {
    setInputText(suggestion)
  }, [])

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      <ChatDrawer
        sessions={sessions}
        currentSessionId={id}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRefresh={handleRefreshSessions}
        isRefreshing={isRefreshingSessions}
        onSettingsPress={handleSettingsPress}
        drawerProgress={drawerProgress}
        onCloseDrawer={closeDrawer}
      />

      <Animated.View
        style={[
          styles.mainContainer,
          {
            paddingTop: insets.top,
            transform: [{ translateX: mainTranslateX }, { scale: mainScale }],
            borderRadius: mainBorderRadius,
          },
        ]}
      >
        <KeyboardCompatibleView style={styles.content}>
          <ChatHeader
            onMenuPress={openDrawer}
            onNewChatPress={handleNewChat}
            onCopyAll={hasMessages ? handleCopyAllOutput : undefined}
          />

          {hasMessages || isLoading ? (
            <TerminalScreen
              sessionId={id}
              onRetryMessage={handleRetryMessage}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
            />
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
        </KeyboardCompatibleView>
      </Animated.View>

      <ModelSwitcher
        visible={modelSwitcherVisible}
        onClose={() => setModelSwitcherVisible(false)}
        showTrigger={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0A0A0A",
    flexDirection: "row",
  },
  mainContainer: {
    flex: 1,
    backgroundColor: "#000000",
    overflow: "hidden",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    flex: 1,
  },
})
