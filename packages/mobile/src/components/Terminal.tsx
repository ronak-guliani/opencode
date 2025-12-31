import { memo, useRef, useCallback, useEffect, useMemo, useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Animated,
  FlatList,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native"
import MarkdownDisplay from "react-native-markdown-display"
import * as Clipboard from "expo-clipboard"
import { useSessionStore, type Message } from "@/store/session"

const Markdown = MarkdownDisplay as any

const ReasoningBlock = memo(function ReasoningBlock({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const lines = text.split("\n").length
  const chars = text.length

  return (
    <View style={styles.reasoningContainer}>
      <TouchableOpacity style={styles.reasoningHeader} onPress={() => setIsExpanded(!isExpanded)} activeOpacity={0.7}>
        <Text style={styles.reasoningHeaderIcon}>{isExpanded ? "▼" : "▶"}</Text>
        <Text style={styles.reasoningHeaderText}>Reasoning</Text>
        <Text style={styles.reasoningMeta}>
          {lines} lines · {chars} chars
        </Text>
      </TouchableOpacity>
      {isExpanded && (
        <ScrollView style={styles.reasoningContent} nestedScrollEnabled>
          <Text style={styles.reasoningText}>{text}</Text>
        </ScrollView>
      )}
    </View>
  )
})

const ThinkingIndicator = memo(function ThinkingIndicator({ text }: { text: string }) {
  const truncated = text.length > 200 ? "..." + text.slice(-200) : text
  const pulseAnim = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    )
    pulse.start()
    return () => pulse.stop()
  }, [])

  return (
    <Animated.View style={[styles.thinkingWrapper, { opacity: pulseAnim }]}>
      <View style={styles.thinkingHeader}>
        <View style={styles.thinkingDot} />
        <Text style={styles.thinkingLabel}>Thinking</Text>
      </View>
      <Text style={styles.thinkingText} numberOfLines={3}>
        {truncated}
      </Text>
    </Animated.View>
  )
})

function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current
  const dot2 = useRef(new Animated.Value(0)).current
  const dot3 = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.delay(400 - delay),
        ]),
      )
    }

    const a1 = animate(dot1, 0)
    const a2 = animate(dot2, 150)
    const a3 = animate(dot3, 300)

    a1.start()
    a2.start()
    a3.start()

    return () => {
      a1.stop()
      a2.stop()
      a3.stop()
    }
  }, [])

  const dotStyle = (anim: Animated.Value) => ({
    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [
      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
    ],
  })

  return (
    <View style={styles.typingWrapper}>
      <View style={styles.typingBubble}>
        <Animated.View style={[styles.typingDot, dotStyle(dot1)]} />
        <Animated.View style={[styles.typingDot, dotStyle(dot2)]} />
        <Animated.View style={[styles.typingDot, dotStyle(dot3)]} />
      </View>
    </View>
  )
}

const CodeBlock = memo(function CodeBlock({ content, language }: { content: string; language?: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = async () => {
    await Clipboard.setStringAsync(content)
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <View style={styles.codeBlockContainer}>
      <View style={styles.codeBlockHeader}>
        <Text style={styles.codeBlockLanguage}>{language || "code"}</Text>
        <TouchableOpacity onPress={handleCopy} style={styles.copyButton}>
          <Text style={styles.copyButtonText}>{copied ? "Copied!" : "Copy"}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.codeBlockScroll}>
        <Text style={styles.codeBlockText}>{content}</Text>
      </ScrollView>
    </View>
  )
})

const markdownStyles = StyleSheet.create({
  body: {
    color: "#ffffff",
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 12,
  },
  heading1: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 12,
  },
  heading2: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "600",
    marginTop: 18,
    marginBottom: 10,
  },
  heading3: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  heading4: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 14,
    marginBottom: 6,
  },
  heading5: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 4,
  },
  heading6: {
    color: "#cccccc",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 10,
    marginBottom: 4,
  },
  strong: {
    fontWeight: "700",
    color: "#ffffff",
  },
  em: {
    fontStyle: "italic",
    color: "#ffffff",
  },
  link: {
    color: "#3B82F6",
    textDecorationLine: "underline",
  },
  blockquote: {
    backgroundColor: "#1A1A1A",
    borderLeftWidth: 4,
    borderLeftColor: "#3B82F6",
    paddingLeft: 12,
    paddingVertical: 8,
    marginVertical: 8,
  },
  code_inline: {
    backgroundColor: "#1A1A1A",
    color: "#E06C75",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 14,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fence: {
    backgroundColor: "#0D0D0D",
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    color: "#ABB2BF",
    overflow: "hidden",
  },
  code_block: {
    backgroundColor: "#0D0D0D",
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    color: "#ABB2BF",
  },
  list_item: {
    marginBottom: 6,
  },
  bullet_list: {
    marginVertical: 8,
  },
  ordered_list: {
    marginVertical: 8,
  },
  bullet_list_icon: {
    color: "#3B82F6",
    fontSize: 16,
    marginRight: 8,
  },
  ordered_list_icon: {
    color: "#3B82F6",
    fontSize: 14,
    marginRight: 8,
  },
  hr: {
    backgroundColor: "#333333",
    height: 1,
    marginVertical: 16,
  },
  table: {
    borderWidth: 1,
    borderColor: "#333333",
    borderRadius: 4,
    marginVertical: 8,
  },
  thead: {
    backgroundColor: "#1A1A1A",
  },
  th: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  tr: {
    borderBottomWidth: 1,
    borderBottomColor: "#1A1A1A",
  },
  td: {
    padding: 8,
  },
  image: {
    borderRadius: 8,
    marginVertical: 8,
  },
})

const markdownRules = {
  fence: (node: any) => {
    const language = node.sourceInfo || ""
    const content = node.content || ""
    return <CodeBlock key={node.key} content={content.trim()} language={language} />
  },
  code_block: (node: any) => {
    const content = node.content || ""
    return <CodeBlock key={node.key} content={content.trim()} />
  },
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <Markdown style={markdownStyles} rules={markdownRules}>
      {content}
    </Markdown>
  )
}

interface TerminalScreenProps {
  onRetryMessage?: (message: Message) => void
  onRefresh?: () => Promise<void>
  isRefreshing?: boolean
}

const SCROLL_THRESHOLD = 100

export function TerminalScreen({ onRetryMessage, onRefresh, isRefreshing = false }: TerminalScreenProps) {
  const messages = useSessionStore((state) => state.messages)
  const isWaiting = useSessionStore((state) => state.isWaitingForResponse)
  const thinkingText = useSessionStore((state) => state.thinkingText)
  const listRef = useRef<FlatList<Message>>(null)
  const isNearBottom = useRef(true)
  const isUserScrolling = useRef(false)
  const lastContentHeight = useRef(0)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const visibleMessages = useMemo(() => messages.filter((m) => m.content && m.content.trim().length > 0), [messages])

  const renderItem = useCallback(
    ({ item }: { item: Message }) => <MessageBubble message={item} onRetry={onRetryMessage} />,
    [onRetryMessage],
  )
  const keyExtractor = useCallback((item: Message, index: number) => item.id || `msg-${index}`, [])

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y
    isNearBottom.current = distanceFromBottom <= SCROLL_THRESHOLD
    setShowScrollButton(!isNearBottom.current)
  }, [])

  const handleScrollBeginDrag = useCallback(() => {
    isUserScrolling.current = true
  }, [])

  const handleScrollEndDrag = useCallback(() => {
    isUserScrolling.current = false
  }, [])

  const handleContentSizeChange = useCallback((_width: number, height: number) => {
    const heightIncreased = height > lastContentHeight.current
    lastContentHeight.current = height
    
    if (heightIncreased && isNearBottom.current && !isUserScrolling.current) {
      listRef.current?.scrollToEnd({ animated: false })
    }
  }, [])

  const scrollToBottom = useCallback(() => {
    isNearBottom.current = true
    setShowScrollButton(false)
    listRef.current?.scrollToEnd({ animated: false })
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: false })
    }, 50)
  }, [])

  const footer = useMemo(() => {
    if (thinkingText) return <ThinkingIndicator text={thinkingText} />
    if (isWaiting) return <TypingIndicator />
    return null
  }, [thinkingText, isWaiting])

  const refreshControl = onRefresh ? (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      tintColor="#3B82F6"
      colors={["#3B82F6"]}
      progressBackgroundColor="#1A1A1A"
    />
  ) : undefined

  const messagesHash = useMemo(
    () => visibleMessages.map((m) => `${m.id}:${m.content?.length || 0}:${m.reasoning?.length || 0}`).join(","),
    [visibleMessages],
  )

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        style={styles.listContainer}
        contentContainerStyle={styles.contentContainer}
        data={visibleMessages}
        extraData={messagesHash}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListFooterComponent={footer}
        initialNumToRender={50}
        maxToRenderPerBatch={20}
        windowSize={21}
        removeClippedSubviews={false}
        refreshControl={refreshControl}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onContentSizeChange={handleContentSizeChange}
        scrollEventThrottle={16}
        maintainVisibleContentPosition={null}
      />
      {showScrollButton && (
        <TouchableOpacity style={styles.scrollButton} onPress={scrollToBottom} activeOpacity={0.8}>
          <Text style={styles.scrollButtonText}>↓</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

export const MessageBubble = memo(
  function MessageBubble({ message, onRetry }: { message: Message; onRetry?: (message: Message) => void }) {
    const isUser = message.role === "user"
    const isFailed = message.status === "failed"
    const isSending = message.status === "sending"
    const fadeAnim = useRef(new Animated.Value(0)).current
    const slideAnim = useRef(new Animated.Value(10)).current

    useEffect(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start()
    }, [])

    const handleRetry = () => {
      if (onRetry && isFailed) {
        onRetry(message)
      }
    }

    return (
      <Animated.View
        style={[
          styles.bubbleWrapper,
          isUser ? styles.userWrapper : styles.assistantWrapper,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {isUser ? (
          <View style={styles.userMessageWrapper}>
            <View style={[styles.messageContainer, styles.userMessage, isFailed && styles.failedMessage]}>
              <Text style={[styles.messageText, styles.userMessageText]}>{message.content}</Text>
            </View>
            {isFailed && (
              <TouchableOpacity style={styles.retryRow} onPress={handleRetry}>
                <Text style={styles.failedText}>Failed to send</Text>
                <Text style={styles.retryText}>Tap to retry</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.assistantContainer}>
            {message.reasoning && <ReasoningBlock text={message.reasoning} />}
            <View style={styles.markdownContainer}>
              <MarkdownContent content={message.content} />
            </View>
          </View>
        )}
      </Animated.View>
    )
  },
  (prev, next) =>
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.reasoning === next.message.reasoning &&
    prev.message.status === next.message.status,
)

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  listContainer: {
    flex: 1,
  },
  contentContainer: {
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  scrollButton: {
    position: "absolute",
    bottom: 16,
    right: 16,
    backgroundColor: "#1A1A1A",
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#333333",
  },
  scrollButtonText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "600",
  },
  bubbleWrapper: {
    width: "100%",
    marginBottom: 24,
  },
  userWrapper: {
    alignItems: "flex-end",
  },
  assistantWrapper: {
    alignItems: "flex-start",
  },
  assistantContainer: {
    width: "100%",
    paddingRight: 16,
  },
  markdownContainer: {
    flex: 1,
  },
  messageContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: "85%",
    borderRadius: 20,
  },
  userMessage: {
    backgroundColor: "#3B82F6",
  },
  failedMessage: {
    backgroundColor: "#7f1d1d",
    opacity: 0.9,
  },
  userMessageWrapper: {
    alignItems: "flex-end",
    maxWidth: "85%",
  },
  statusText: {
    color: "#888888",
    fontSize: 11,
    marginTop: 4,
  },
  retryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 8,
  },
  failedText: {
    color: "#ef4444",
    fontSize: 11,
  },
  retryText: {
    color: "#3B82F6",
    fontSize: 11,
    fontWeight: "500",
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  userMessageText: {
    color: "#ffffff",
  },
  assistantMessageText: {
    color: "#ffffff",
    flex: 1,
  },
  thinkingWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#3B82F6",
  },
  thinkingHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  thinkingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#3B82F6",
    marginRight: 8,
  },
  thinkingLabel: {
    color: "#3B82F6",
    fontSize: 13,
    fontWeight: "600",
  },
  thinkingText: {
    color: "#8b949e",
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 18,
  },
  typingWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    marginLeft: 12,
  },
  typingBubble: {
    flexDirection: "row",
    backgroundColor: "#1A1A1A",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    alignSelf: "flex-start",
    gap: 5,
    alignItems: "center",
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#3B82F6",
  },
  codeBlockContainer: {
    backgroundColor: "#0D0D0D",
    borderRadius: 8,
    marginVertical: 8,
    overflow: "hidden",
  },
  codeBlockHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  codeBlockLanguage: {
    color: "#888888",
    fontSize: 12,
    fontWeight: "500",
    textTransform: "lowercase",
  },
  copyButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  copyButtonText: {
    color: "#3B82F6",
    fontSize: 12,
    fontWeight: "500",
  },
  codeBlockScroll: {
    padding: 12,
  },
  codeBlockText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    color: "#ABB2BF",
    lineHeight: 20,
  },
  reasoningContainer: {
    marginTop: 4,
    marginBottom: 12,
    marginLeft: 28,
    backgroundColor: "rgba(59, 130, 246, 0.05)",
    borderRadius: 8,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(59, 130, 246, 0.3)",
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 2,
  },
  reasoningHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  reasoningHeaderIcon: {
    color: "rgba(59, 130, 246, 0.6)",
    fontSize: 10,
    marginRight: 6,
    width: 10,
  },
  reasoningHeaderText: {
    color: "rgba(59, 130, 246, 0.8)",
    fontSize: 12,
    fontWeight: "500",
  },
  reasoningMeta: {
    color: "rgba(59, 130, 246, 0.5)",
    fontSize: 11,
    marginLeft: 8,
  },
  reasoningContent: {
    marginTop: 4,
    paddingTop: 4,
    maxHeight: 200,
  },
  reasoningText: {
    color: "#6e7681",
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 18,
  },
})
