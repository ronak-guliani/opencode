import { useMemo, useCallback, useRef, useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SectionList,
  Animated,
  PanResponder,
  TextInput,
  RefreshControl,
  useWindowDimensions,
  type GestureResponderHandlers,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { Session } from "@/store/session"

const DRAWER_WIDTH_RATIO = 0.75

interface ChatDrawerProps {
  sessions: Session[]
  currentSessionId: string | null
  onSelectSession: (id: string) => void
  onNewChat: () => void
  onDeleteSession: (id: string) => void
  onRefresh?: () => Promise<void>
  isRefreshing?: boolean
  onSettingsPress?: () => void
  drawerProgress: Animated.Value
  onCloseDrawer: () => void
}

export const ChatDrawer = ({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRefresh,
  isRefreshing = false,
  onSettingsPress,
  drawerProgress,
  onCloseDrawer,
}: ChatDrawerProps) => {
  const insets = useSafeAreaInsets()
  const { width: screenWidth } = useWindowDimensions()
  const drawerWidth = screenWidth * DRAWER_WIDTH_RATIO
  const startProgress = useRef(0)
  const [searchQuery, setSearchQuery] = useState("")

  // Use refs to avoid stale closure in PanResponder
  const drawerProgressRef = useRef(drawerProgress)
  const onCloseDrawerRef = useRef(onCloseDrawer)
  const drawerWidthRef = useRef(drawerWidth)
  drawerProgressRef.current = drawerProgress
  onCloseDrawerRef.current = onCloseDrawer
  drawerWidthRef.current = drawerWidth

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions
    const query = searchQuery.toLowerCase()
    return sessions.filter((session) => {
      const title = session.title || "New Chat"
      return title.toLowerCase().includes(query)
    })
  }, [sessions, searchQuery])

  const panHandlers = useMemo<GestureResponderHandlers>(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        return gesture.dx < -10 && Math.abs(gesture.dy) < Math.abs(gesture.dx)
      },
      onPanResponderGrant: () => {
        // @ts-ignore - _value exists at runtime
        startProgress.current = drawerProgressRef.current._value
      },
      onPanResponderMove: (_, gesture) => {
        const progress = Math.max(0, Math.min(1, startProgress.current + gesture.dx / drawerWidthRef.current))
        drawerProgressRef.current.setValue(progress)
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < -50 || gesture.vx < -0.5) {
          onCloseDrawerRef.current()
        } else {
          Animated.spring(drawerProgressRef.current, {
            toValue: 1,
            useNativeDriver: true,
            tension: 300,
            friction: 30,
          }).start()
        }
      },
    }).panHandlers
  }, [])

  const groupedSessions = useMemo(() => {
    const groups: { [key: string]: Session[] } = {
      Today: [],
      Yesterday: [],
      "This Week": [],
      "This Month": [],
      Older: [],
    }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const yesterday = new Date(today - 86400000).getTime()
    const weekAgo = new Date(today - 86400000 * 7).getTime()
    const monthAgo = new Date(today - 86400000 * 30).getTime()

    const sorted = [...filteredSessions].sort((a, b) => {
      const timeA = a.time?.updated || a.time?.created || 0
      const timeB = b.time?.updated || b.time?.created || 0
      return timeB - timeA
    })

    sorted.forEach((session) => {
      const time = session.time?.updated || session.time?.created || 0

      if (time >= today) {
        groups["Today"].push(session)
      } else if (time >= yesterday) {
        groups["Yesterday"].push(session)
      } else if (time >= weekAgo) {
        groups["This Week"].push(session)
      } else if (time >= monthAgo) {
        groups["This Month"].push(session)
      } else {
        groups["Older"].push(session)
      }
    })

    return groups
  }, [filteredSessions])

  const handleDeletePress = useCallback(
    (id: string, title: string) => {
      Alert.alert("Delete Chat", `Are you sure you want to delete "${title}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDeleteSession(id),
        },
      ])
    },
    [onDeleteSession],
  )

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      onSelectSession(sessionId)
      onCloseDrawer()
    },
    [onSelectSession, onCloseDrawer],
  )

  const handleNewChat = useCallback(() => {
    onNewChat()
    onCloseDrawer()
  }, [onNewChat, onCloseDrawer])

  const handleSettingsPress = useCallback(() => {
    onCloseDrawer()
    setTimeout(() => onSettingsPress?.(), 200)
  }, [onSettingsPress, onCloseDrawer])

  return (
    <View style={[styles.drawer, { width: drawerWidth, paddingTop: insets.top }]} {...panHandlers}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <TouchableOpacity style={styles.newChatButton} onPress={handleNewChat}>
          <Text style={styles.newChatIcon}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search chats..."
          placeholderTextColor="#666666"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity style={styles.clearButton} onPress={() => setSearchQuery("")}>
            <Text style={styles.clearButtonText}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      <SectionList
        sections={Object.entries(groupedSessions)
          .filter(([_, data]) => data.length > 0)
          .map(([title, data]) => ({ title, data }))}
        keyExtractor={(item) => item.id}
        renderItem={({ item: session }) => {
          const isSelected = session.id === currentSessionId
          return (
            <TouchableOpacity
              style={[styles.sessionItem, isSelected && styles.selectedSessionItem]}
              onPress={() => handleSelectSession(session.id)}
            >
              <Text style={[styles.sessionTitle, isSelected && styles.selectedSessionTitle]} numberOfLines={1}>
                {session.title || "New Chat"}
              </Text>

              <TouchableOpacity
                style={styles.moreButton}
                onPress={() => handleDeletePress(session.id, session.title || "New Chat")}
              >
                <Text style={[styles.moreButtonText, isSelected && styles.selectedMoreButtonText]}>⋯</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )
        }}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.groupTitle}>{title}</Text>
        )}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor="#3B82F6"
              colors={["#3B82F6"]}
              progressBackgroundColor="#1A1A1A"
            />
          ) : undefined
        }
        ListEmptyComponent={
          sessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No conversations yet.</Text>
              <TouchableOpacity style={styles.startChatButton} onPress={handleNewChat}>
                <Text style={styles.startChatText}>Start a new chat</Text>
              </TouchableOpacity>
            </View>
          ) : sessions.length > 0 && filteredSessions.length === 0 && searchQuery.trim() ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No chats match "{searchQuery}"</Text>
            </View>
          ) : null
        }
        stickySectionHeadersEnabled={false}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={styles.userButton} onPress={handleSettingsPress} activeOpacity={0.7}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>👤</Text>
          </View>
          <Text style={styles.username}>Settings</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

export const getDrawerWidth = (screenWidth: number) => screenWidth * DRAWER_WIDTH_RATIO

const styles = StyleSheet.create({
  drawer: {
    backgroundColor: "#0A0A0A",
    height: "100%",
    borderRightWidth: 1,
    borderRightColor: "#1A1A1A",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1A1A1A",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: "IBMPlexMono-Medium",
  },
  newChatButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
  },
  newChatIcon: {
    fontSize: 20,
    color: "#FFFFFF",
    fontFamily: "IBMPlexMono-Regular",
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    position: "relative",
  },
  searchInput: {
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingRight: 36,
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "IBMPlexMono-Regular",
  },
  clearButton: {
    position: "absolute",
    right: 24,
    top: 8,
    bottom: 8,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  clearButtonText: {
    color: "#666666",
    fontSize: 20,
    fontFamily: "IBMPlexMono-Regular",
  },
  scrollContent: {
    paddingVertical: 8,
    paddingBottom: 100,
  },
  groupContainer: {
    marginBottom: 16,
  },
  groupTitle: {
    color: "#666666",
    fontSize: 11,
    fontFamily: "IBMPlexMono-Medium",
    marginLeft: 16,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sessionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 8,
    borderRadius: 8,
  },
  selectedSessionItem: {
    backgroundColor: "#1A1A1A",
  },
  sessionTitle: {
    color: "#E5E5E5",
    fontSize: 15,
    flex: 1,
    marginRight: 8,
    fontFamily: "IBMPlexMono-Regular",
  },
  selectedSessionTitle: {
    color: "#FFFFFF",
    fontFamily: "IBMPlexMono-Medium",
  },
  moreButton: {
    padding: 4,
  },
  moreButtonText: {
    color: "#666666",
    fontSize: 16,
    fontFamily: "IBMPlexMono-Bold",
  },
  selectedMoreButtonText: {
    color: "#888888",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#1A1A1A",
    backgroundColor: "#0A0A0A",
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  userButton: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
  },
  username: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "IBMPlexMono-Medium",
  },
  emptyState: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
  },
  emptyStateText: {
    color: "#666666",
    fontSize: 15,
    marginBottom: 16,
    fontFamily: "IBMPlexMono-Regular",
  },
  startChatButton: {
    backgroundColor: "#1A1A1A",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  startChatText: {
    color: "#E5E5E5",
    fontSize: 14,
    fontFamily: "IBMPlexMono-Medium",
  },
})
