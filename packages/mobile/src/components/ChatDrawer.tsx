import { useMemo, useCallback, useRef, useEffect, useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Dimensions,
  Animated,
  Pressable,
  PanResponder,
  TextInput,
  RefreshControl,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { Session } from "@/store/session"

const SCREEN_WIDTH = Dimensions.get("window").width
const DRAWER_WIDTH = SCREEN_WIDTH * 0.7

interface ChatDrawerProps {
  visible: boolean
  onClose: () => void
  sessions: Session[]
  currentSessionId: string | null
  onSelectSession: (id: string) => void
  onNewChat: () => void
  onDeleteSession: (id: string) => void
  onRefresh?: () => Promise<void>
  isRefreshing?: boolean
  translateX: Animated.Value
}

export const ChatDrawer = ({
  visible,
  onClose,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRefresh,
  isRefreshing = false,
  translateX,
}: ChatDrawerProps) => {
  const insets = useSafeAreaInsets()
  const startX = useRef(0)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions
    const query = searchQuery.toLowerCase()
    return sessions.filter((session) => {
      const title = session.title || "New Chat"
      return title.toLowerCase().includes(query)
    })
  }, [sessions, searchQuery])

  const backdropOpacity = translateX.interpolate({
    inputRange: [-DRAWER_WIDTH, 0],
    outputRange: [0, 0.5],
    extrapolate: "clamp",
  })

  const closeDrawer = useCallback(() => {
    Animated.timing(translateX, {
      toValue: -DRAWER_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onClose()
    })
  }, [translateX, onClose])

  const openDrawer = useCallback(() => {
    Animated.timing(translateX, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start()
  }, [translateX])

  const drawerPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        return gesture.dx < -10 && Math.abs(gesture.dy) < Math.abs(gesture.dx)
      },
      onPanResponderGrant: () => {
        // @ts-ignore - _value exists at runtime
        startX.current = translateX._value
      },
      onPanResponderMove: (_, gesture) => {
        const x = Math.max(-DRAWER_WIDTH, Math.min(0, startX.current + gesture.dx))
        translateX.setValue(x)
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < -50 || gesture.vx < -0.5) {
          closeDrawer()
        } else {
          openDrawer()
        }
      },
    }),
  ).current

  useEffect(() => {
    if (visible) {
      Animated.timing(translateX, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start()
    }
  }, [visible, translateX])

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

  const isInteractive = visible

  return (
    <View style={[StyleSheet.absoluteFill, styles.container]} pointerEvents={isInteractive ? "auto" : "none"}>
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents={isInteractive ? "auto" : "none"}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
      </Animated.View>

      <Animated.View
        style={[styles.drawer, { width: DRAWER_WIDTH, paddingTop: insets.top, transform: [{ translateX }] }]}
        {...drawerPanResponder.panHandlers}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Chats</Text>
          <TouchableOpacity
            style={styles.newChatButton}
            onPress={() => {
              onNewChat()
              closeDrawer()
            }}
          >
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

        <ScrollView
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
        >
          {Object.entries(groupedSessions).map(([group, groupSessions]) => {
            if (groupSessions.length === 0) return null

            return (
              <View key={group} style={styles.groupContainer}>
                <Text style={styles.groupTitle}>{group}</Text>
                {groupSessions.map((session) => {
                  const isSelected = session.id === currentSessionId
                  return (
                    <TouchableOpacity
                      key={session.id}
                      style={[styles.sessionItem, isSelected && styles.selectedSessionItem]}
                      onPress={() => {
                        onSelectSession(session.id)
                        closeDrawer()
                      }}
                    >
                      <Text style={[styles.sessionTitle, isSelected && styles.selectedSessionTitle]} numberOfLines={1}>
                        {session.title || "New Chat"}
                      </Text>

                      <TouchableOpacity
                        style={styles.moreButton}
                        onPress={() => handleDeletePress(session.id, session.title)}
                      >
                        <Text style={[styles.moreButtonText, isSelected && styles.selectedMoreButtonText]}>⋯</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )
          })}

          {sessions.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No conversations yet.</Text>
              <TouchableOpacity
                style={styles.startChatButton}
                onPress={() => {
                  onNewChat()
                  closeDrawer()
                }}
              >
                <Text style={styles.startChatText}>Start a new chat</Text>
              </TouchableOpacity>
            </View>
          )}

          {sessions.length > 0 && filteredSessions.length === 0 && searchQuery.trim() && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No chats match "{searchQuery}"</Text>
            </View>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>👤</Text>
          </View>
          <Text style={styles.username}>User</Text>
        </View>
      </Animated.View>
    </View>
  )
}

export const CHAT_DRAWER_WIDTH = DRAWER_WIDTH

const styles = StyleSheet.create({
  container: {
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
  },
  drawer: {
    backgroundColor: "#0A0A0A",
    height: "100%",
    borderRightWidth: 1,
    borderRightColor: "#1A1A1A",
    position: "absolute",
    left: 0,
    top: 0,
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
    fontWeight: "700",
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
    fontWeight: "300",
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
    fontWeight: "300",
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
    fontWeight: "600",
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
  },
  selectedSessionTitle: {
    color: "#FFFFFF",
    fontWeight: "500",
  },
  moreButton: {
    padding: 4,
  },
  moreButtonText: {
    color: "#666666",
    fontSize: 16,
    fontWeight: "bold",
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
    fontWeight: "500",
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
  },
})
