import React, { useEffect, useRef, useMemo, useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  TouchableWithoutFeedback,
  Alert,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { Session } from "@/store/session"

interface ChatDrawerProps {
  visible: boolean
  onClose: () => void
  sessions: Session[]
  currentSessionId: string | null
  onSelectSession: (id: string) => void
  onNewChat: () => void
  onDeleteSession: (id: string) => void
}

const { width: SCREEN_WIDTH } = Dimensions.get("window")
const DRAWER_WIDTH = SCREEN_WIDTH * 0.85

export const ChatDrawer = ({
  visible,
  onClose,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
}: ChatDrawerProps) => {
  const insets = useSafeAreaInsets()
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current
  const fadeAnim = useRef(new Animated.Value(0)).current
  const [showModal, setShowModal] = useState(visible)

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

    const sorted = [...sessions].sort((a, b) => {
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
  }, [sessions])

  useEffect(() => {
    if (visible) {
      setShowModal(true)
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setShowModal(false)
        }
      })
    }
  }, [visible])

  const handleClose = () => {
    onClose()
  }

  const handleDeletePress = (id: string, title: string) => {
    Alert.alert("Delete Chat", `Are you sure you want to delete "${title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => onDeleteSession(id),
      },
    ])
  }

  if (!showModal) return null

  return (
    <Modal visible={showModal} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.overlayContainer}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.drawer,
            {
              transform: [{ translateX: slideAnim }],
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => {
                Alert.alert("Clear History", "This feature is not yet implemented.")
              }}
            >
              <Text style={styles.iconText}>🗑️</Text>
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Chatbot</Text>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => {
                onNewChat()
                onClose()
              }}
            >
              <Text style={styles.iconText}>➕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
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
                          onClose()
                        }}
                      >
                        <Text
                          style={[styles.sessionTitle, isSelected && styles.selectedSessionTitle]}
                          numberOfLines={1}
                        >
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
                    onClose()
                  }}
                >
                  <Text style={styles.startChatText}>Start a new chat</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>👤</Text>
            </View>
            <Text style={styles.username}>User</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    flexDirection: "row",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  drawer: {
    width: DRAWER_WIDTH,
    height: "100%",
    backgroundColor: "#000000",
    borderRightWidth: 1,
    borderRightColor: "#1A1A1A",
    shadowColor: "#000",
    shadowOffset: { width: 5, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1A1A1A",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  iconButton: {
    padding: 8,
  },
  iconText: {
    fontSize: 20,
    color: "#FFFFFF",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 8,
  },
  groupContainer: {
    marginBottom: 16,
  },
  groupTitle: {
    color: "#666666",
    fontSize: 12,
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
    backgroundColor: "#3B82F6",
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
    color: "rgba(255,255,255,0.7)",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#1A1A1A",
    backgroundColor: "#000000",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#333",
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
    borderWidth: 1,
    borderColor: "#333",
  },
  startChatText: {
    color: "#E5E5E5",
    fontSize: 14,
  },
})
