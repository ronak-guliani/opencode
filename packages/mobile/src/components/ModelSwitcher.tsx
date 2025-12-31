import { useState, memo, useMemo, useCallback, useEffect, useRef } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Animated,
  Easing,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useProviderStore } from "@/store/provider"

interface ModelSwitcherProps {
  visible?: boolean
  onClose?: () => void
  showTrigger?: boolean
}

export const ModelSwitcher = memo(function ModelSwitcher({
  visible: externalVisible,
  onClose,
  showTrigger = true,
}: ModelSwitcherProps) {
  const insets = useSafeAreaInsets()
  const [internalVisible, setInternalVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const visible = externalVisible !== undefined ? externalVisible : internalVisible
  const [modalVisible, setModalVisible] = useState(visible)

  const fadeAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.95)).current

  useEffect(() => {
    if (visible) {
      setModalVisible(true)
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          damping: 15,
          stiffness: 150,
          mass: 0.8,
        }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.95,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setModalVisible(false)
      })
    }
  }, [visible])

  const { getSelectedModel, setSelectedModel, getConnectedModels, getModel, favorites, toggleFavorite, isFavorite } =
    useProviderStore()

  const selected = getSelectedModel()
  const models = getConnectedModels()
  const selectedModelInfo = selected ? getModel(selected.providerID, selected.modelID) : null
  const displayName = selectedModelInfo?.name || selected?.modelID || "Select Model"

  const handleClose = useCallback(() => {
    Keyboard.dismiss()
    setSearchQuery("")
    if (onClose) {
      onClose()
    } else {
      setInternalVisible(false)
    }
  }, [onClose])

  const groupedModels = useMemo(() => {
    const filtered = models.filter((item) => item.model.name.toLowerCase().includes(searchQuery.toLowerCase()))

    // Get favorite models
    const favoriteModels = favorites
      .map((fav) => {
        const fullModel = models.find((m) => m.provider.id === fav.providerID && m.model.id === fav.modelID)
        return fullModel
      })
      .filter((m) => m !== undefined && m.model.name.toLowerCase().includes(searchQuery.toLowerCase())) as typeof models

    const groups: Array<{ title: string; providerId: string; data: typeof models }> = []

    // Add favorites group if exists
    if (favoriteModels.length > 0) {
      groups.push({
        title: "Favorites",
        providerId: "favorites",
        data: favoriteModels,
      })
    }

    const providerGroups: Record<string, typeof models> = {}

    filtered.forEach((item) => {
      const pid = item.provider.id
      if (!providerGroups[pid]) providerGroups[pid] = []
      providerGroups[pid].push(item)
    })

    const otherGroups = Object.entries(providerGroups).map(([providerId, data]) => ({
      title: data[0].provider.name,
      providerId,
      data,
    }))

    return [...groups, ...otherGroups]
  }, [models, searchQuery, favorites])

  const getProviderIcon = (id: string) => {
    const lower = id.toLowerCase()
    if (lower === "favorites") return "⭐"
    if (lower.includes("anthropic")) return "🤖"
    if (lower.includes("openai")) return "🧠"
    if (lower.includes("google")) return "🔮"
    return "⚡"
  }

  return (
    <>
      {showTrigger && (
        <TouchableOpacity style={styles.trigger} onPress={() => setInternalVisible(true)}>
          <Text style={styles.triggerText} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.chevron}>▼</Text>
        </TouchableOpacity>
      )}

      <Modal visible={modalVisible} transparent animationType="none" onRequestClose={handleClose}>
        <View style={styles.modalContainer}>
          <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
          </Animated.View>

          <Animated.View
            style={[
              styles.popup,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search models..."
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
              />
            </View>

            <ScrollView
              style={styles.list}
              contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom > 0 ? 8 : 16 }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {groupedModels.map((group) => (
                <View key={group.providerId} style={styles.group}>
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupIcon}>{getProviderIcon(group.providerId)}</Text>
                    <Text style={styles.groupTitle}>{group.title}</Text>
                  </View>
                  {group.data.map((item) => {
                    const isSelected = selected?.providerID === item.provider.id && selected?.modelID === item.model.id
                    return (
                      <TouchableOpacity
                        key={`${item.provider.id}-${item.model.id}`}
                        style={[styles.option, isSelected && styles.optionSelected]}
                        onPress={() => {
                          setSelectedModel({ providerID: item.provider.id, modelID: item.model.id })
                          handleClose()
                        }}
                      >
                        <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                          {item.model.name}
                        </Text>
                        <View style={styles.optionRight}>
                          {isSelected && <Text style={styles.checkIcon}>✓</Text>}
                          <TouchableOpacity
                            style={styles.favoriteButton}
                            onPress={(e) => {
                              e.stopPropagation()
                              toggleFavorite({ providerID: item.provider.id, modelID: item.model.id })
                            }}
                          >
                            <Text
                              style={[
                                styles.favoriteIcon,
                                isFavorite({ providerID: item.provider.id, modelID: item.model.id }) &&
                                  styles.favoriteIconActive,
                              ]}
                            >
                              {isFavorite({ providerID: item.provider.id, modelID: item.model.id }) ? "⭐" : "☆"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              ))}

              {groupedModels.length === 0 && <Text style={styles.emptyText}>No models found</Text>}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </>
  )
})

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#21262d",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(240, 246, 252, 0.1)",
  },
  triggerText: {
    color: "#e6edf3",
    fontSize: 13,
    fontWeight: "500",
    maxWidth: 120,
  },
  chevron: {
    color: "#8b949e",
    fontSize: 10,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  popup: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    width: "100%",
    maxHeight: "70%",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#333",
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  searchInput: {
    backgroundColor: "#0D0D0D",
    color: "#fff",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  list: {
    maxHeight: 400,
  },
  listContent: {
    paddingVertical: 8,
  },
  group: {
    marginBottom: 8,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  groupIcon: {
    fontSize: 14,
  },
  groupTitle: {
    color: "#666",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 8,
    borderRadius: 8,
  },
  optionSelected: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
  },
  optionText: {
    color: "#ccc",
    fontSize: 15,
  },
  optionTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  checkIcon: {
    color: "#3B82F6",
    fontSize: 16,
    fontWeight: "bold",
  },
  emptyText: {
    color: "#666",
    textAlign: "center",
    marginTop: 40,
    fontSize: 15,
  },
  optionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  favoriteButton: {
    padding: 4,
  },
  favoriteIcon: {
    fontSize: 16,
    color: "#666",
  },
  favoriteIconActive: {
    color: "#eab308",
  },
})
