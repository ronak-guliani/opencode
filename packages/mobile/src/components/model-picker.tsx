import { useMemo, useCallback, memo, useState, useEffect, useRef } from "react"
import {
  View,
  Text,
  Pressable,
  SectionList,
  StyleSheet,
  Modal,
  useWindowDimensions,
  TextInput,
  Platform,
  type GestureResponderEvent,
} from "react-native"
import Feather from "@expo/vector-icons/Feather"
import Ionicons from "@expo/vector-icons/Ionicons"
import { BlurView } from "expo-blur"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as Haptics from "expo-haptics"
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated"
import { useSettings, modelName, modelKey } from "../store/settings"
import { useTheme, type Theme } from "../theme"

const AnimatedView = Animated.View as React.ComponentType<{ style?: unknown; children?: React.ReactNode }>
const FeatherIcon = Feather as unknown as React.ComponentType<{ name: string; size: number; color: string }>
const IonIcon = Ionicons as unknown as React.ComponentType<{ name: string; size: number; color: string }>

export type ModelPoint = {
  x: number
  y: number
}

type PickerMode = "all" | "favorites"
type PickerButtonVariant = "icon" | "pill"

type ModelItem = {
  key: string
  id: string
  name: string
  search: string
  providerID: string
  providerName: string
  reasoning: boolean
  favorite: boolean
  removed: boolean
}

type ModelSection = {
  providerID: string
  providerName: string
  data: ModelItem[]
}

type Props = {
  visible: boolean
  onClose: () => void
  anchor?: ModelPoint | null
}

const POPULAR_PROVIDERS = ["opencode", "anthropic", "github-copilot", "openai", "google", "openrouter", "vercel"] as const
const SHEET_HORIZONTAL_PADDING = 10
const SHEET_TOP_GAP = 24
const SHEET_BOTTOM_GAP = 8

function compareProviderOrder(aID: string, aName: string, bID: string, bName: string) {
  const ai = POPULAR_PROVIDERS.indexOf(aID as (typeof POPULAR_PROVIDERS)[number])
  const bi = POPULAR_PROVIDERS.indexOf(bID as (typeof POPULAR_PROVIDERS)[number])
  if (ai >= 0 && bi < 0) return -1
  if (ai < 0 && bi >= 0) return 1
  if (ai >= 0 && bi >= 0 && ai !== bi) return ai - bi
  return aName.localeCompare(bName)
}

function compareModelOrder(a: ModelItem, b: ModelItem) {
  if (a.favorite && !b.favorite) return -1
  if (!a.favorite && b.favorite) return 1
  const byName = a.name.localeCompare(b.name)
  if (byName !== 0) return byName
  return a.id.localeCompare(b.id)
}

export function ModelPicker({ visible, onClose }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const providerData = useSettings((s) => s.providerData)
  const fetchProviders = useSettings((s) => s.fetchProviders)
  const current = useSettings((s) => s.model)
  const setModel = useSettings((s) => s.setModel)
  const favorites = useSettings((s) => s.favorites)
  const removed = useSettings((s) => s.removed)
  const toggleFavorite = useSettings((s) => s.toggleFavorite)
  const removeModel = useSettings((s) => s.removeModel)
  const restoreModel = useSettings((s) => s.restoreModel)
  const activeName = useSettings(modelName)
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<PickerMode>("all")
  const [showRemoved, setShowRemoved] = useState(false)
  const closing = useRef(false)
  const shade = useSharedValue(0)
  const sheet = useSharedValue(0)

  const maxHeight = Math.max(360, height - insets.top - SHEET_TOP_GAP - insets.bottom - SHEET_BOTTOM_GAP)
  const maxWidth = Math.min(width - SHEET_HORIZONTAL_PADDING * 2, 620)
  const isDark = theme.colors.background === "#09090b"
  const sheetTint = theme.colors.background + (isDark ? "cc" : "ea")

  useEffect(() => {
    if (!visible) return
    closing.current = false
    void fetchProviders()
    shade.value = 0
    sheet.value = 0
    shade.value = withTiming(1, {
      duration: 170,
      easing: Easing.out(Easing.cubic),
    })
    sheet.value = withSpring(1, {
      damping: 24,
      stiffness: 290,
      mass: 0.82,
    })
  }, [visible, fetchProviders, shade, sheet])

  const finishClose = useCallback(() => {
    closing.current = false
    setQuery("")
    setMode("all")
    setShowRemoved(false)
    onClose()
  }, [onClose])

  const handleClose = useCallback(() => {
    if (closing.current) return
    closing.current = true
    shade.value = withTiming(0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    })
    sheet.value = withTiming(
      0,
      {
        duration: 190,
        easing: Easing.bezier(0.32, 0.72, 0, 1),
      },
      (done) => {
        if (done) runOnJS(finishClose)()
      },
    )
  }, [finishClose, shade, sheet])

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: shade.value,
  }))

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - sheet.value) * 34 }, { scale: 0.985 + sheet.value * 0.015 }],
  }))

  const allModels = useMemo<ModelItem[]>(() => {
    if (!providerData) return []

    const connected = new Set(providerData.connected)
    const hasConnectedMatch = providerData.all.some((provider) => connected.has(provider.id))
    const list: ModelItem[] = []

    for (const provider of providerData.all) {
      if (hasConnectedMatch && !connected.has(provider.id)) continue
      const providerName = provider.name || provider.id
      for (const [baseID, info] of Object.entries(provider.models)) {
        if (info.status === "deprecated") continue
        const id = info.id || baseID
        const name = info.name || id
        const key = modelKey({ providerID: provider.id, modelID: id })
        list.push({
          key,
          id,
          name,
          search: `${name} ${id} ${providerName} ${provider.id}`.toLowerCase(),
          providerID: provider.id,
          providerName,
          reasoning: !!info.reasoning,
          favorite: !!favorites[key],
          removed: !!removed[key],
        })
      }
    }

    return list
  }, [providerData, favorites, removed])

  const queryValue = useMemo(() => query.trim().toLowerCase(), [query])

  const models = useMemo(() => {
    return allModels.filter((item) => {
      if (!showRemoved && item.removed) return false
      if (mode === "favorites" && !item.favorite) return false
      if (!queryValue) return true
      return item.search.includes(queryValue)
    })
  }, [allModels, mode, queryValue, showRemoved])

  const sections = useMemo<ModelSection[]>(() => {
    const map = new Map<string, ModelSection>()
    for (const item of models) {
      const section = map.get(item.providerID)
      if (section) {
        section.data.push(item)
        continue
      }
      map.set(item.providerID, {
        providerID: item.providerID,
        providerName: item.providerName,
        data: [item],
      })
    }

    return Array.from(map.values())
      .map((section) => ({
        ...section,
        data: section.data.sort(compareModelOrder),
      }))
      .sort((a, b) => compareProviderOrder(a.providerID, a.providerName, b.providerID, b.providerName))
  }, [models])

  const selected = current ? modelKey(current) : null
  const favoriteCount = useMemo(() => allModels.filter((item) => item.favorite).length, [allModels])
  const removedCount = useMemo(() => allModels.filter((item) => item.removed).length, [allModels])
  const selectedProvider = useMemo(() => {
    if (!current || !providerData) return "Default"
    return providerData.all.find((provider) => provider.id === current.providerID)?.name || current.providerID
  }, [current, providerData])

  const emptyText = useMemo(() => {
    if (!providerData) return "Loading models..."
    if (!allModels.length) return "No models available"
    if (queryValue) return "No models match your search"
    if (mode === "favorites" && favoriteCount === 0) return "No favorite models yet"
    if (!showRemoved && removedCount > 0 && models.length === 0) return "No visible models. Enable removed to restore."
    return "No models available"
  }, [allModels.length, favoriteCount, mode, models.length, providerData, queryValue, removedCount, showRemoved])

  const handleSelect = useCallback(
    (item: ModelItem) => {
      if (item.removed) return
      void Haptics.selectionAsync()
      setModel({ providerID: item.providerID, modelID: item.id })
      handleClose()
    },
    [handleClose, setModel],
  )

  const handleDefault = useCallback(() => {
    void Haptics.selectionAsync()
    setModel(null)
    handleClose()
  }, [handleClose, setModel])

  const handleFavorite = useCallback(
    (item: ModelItem) => {
      void Haptics.selectionAsync()
      toggleFavorite({ providerID: item.providerID, modelID: item.id })
    },
    [toggleFavorite],
  )

  const handleRemove = useCallback(
    (item: ModelItem) => {
      void Haptics.selectionAsync()
      removeModel({ providerID: item.providerID, modelID: item.id })
    },
    [removeModel],
  )

  const handleRestore = useCallback(
    (item: ModelItem) => {
      void Haptics.selectionAsync()
      restoreModel({ providerID: item.providerID, modelID: item.id })
    },
    [restoreModel],
  )

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.modalRoot}>
        <AnimatedView style={[styles.backdrop, backdropStyle]}>
          <Pressable style={styles.backdropPress} onPress={handleClose}>
            <View />
          </Pressable>
        </AnimatedView>
        <View style={[styles.sheetWrap, { paddingBottom: insets.bottom + SHEET_BOTTOM_GAP }]}>
          <AnimatedView
            style={[
              styles.sheet,
              sheetStyle,
              {
                height: maxHeight,
                maxWidth,
                borderColor: theme.colors.border + "99",
              },
            ]}
          >
            <BlurView intensity={Platform.OS === "ios" ? 50 : 0} tint={isDark ? "dark" : "light"} style={styles.sheetBlur}>
              <View style={[styles.sheetTone, { backgroundColor: sheetTint }]}>
                <View style={[styles.grabber, { backgroundColor: theme.colors.textTertiary + "66" }]} />
                <View style={[styles.header, { borderBottomColor: theme.colors.border + "77" }]}>
                  <View style={styles.headerCopy}>
                    <Text style={[styles.title, { color: theme.colors.text }]}>Choose model</Text>
                    <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                      {activeName} • {selectedProvider}
                    </Text>
                  </View>
                  <Pressable
                    onPress={handleClose}
                    style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Close model picker"
                  >
                    <FeatherIcon name="x" size={16} color={theme.colors.textSecondary} />
                  </Pressable>
                </View>

                <View style={styles.filters}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.filterChip,
                      {
                        backgroundColor: mode === "all" ? theme.colors.accent + "24" : theme.colors.surfaceRaised + "80",
                        borderColor: mode === "all" ? theme.colors.accent + "66" : theme.colors.border + "88",
                      },
                      pressed && styles.pressed,
                    ]}
                    onPress={() => setMode("all")}
                  >
                    <Text style={[styles.filterLabel, { color: mode === "all" ? theme.colors.accent : theme.colors.textSecondary }]}>All</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.filterChip,
                      {
                        backgroundColor: mode === "favorites" ? theme.colors.warning + "20" : theme.colors.surfaceRaised + "80",
                        borderColor: mode === "favorites" ? theme.colors.warning + "66" : theme.colors.border + "88",
                      },
                      pressed && styles.pressed,
                    ]}
                    onPress={() => setMode("favorites")}
                  >
                    <Text
                      style={[
                        styles.filterLabel,
                        {
                          color: mode === "favorites" ? theme.colors.warning : theme.colors.textSecondary,
                        },
                      ]}
                    >
                      Favorites
                    </Text>
                    <Text style={[styles.filterCount, { color: theme.colors.textTertiary }]}>{favoriteCount}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.filterChip,
                      {
                        backgroundColor: showRemoved ? theme.colors.error + "20" : theme.colors.surfaceRaised + "80",
                        borderColor: showRemoved ? theme.colors.error + "66" : theme.colors.border + "88",
                        opacity: removedCount === 0 ? 0.6 : 1,
                      },
                      pressed && styles.pressed,
                    ]}
                    disabled={removedCount === 0}
                    onPress={() => setShowRemoved((prev) => !prev)}
                  >
                    <Text style={[styles.filterLabel, { color: showRemoved ? theme.colors.error : theme.colors.textSecondary }]}>
                      Removed
                    </Text>
                    <Text style={[styles.filterCount, { color: theme.colors.textTertiary }]}>{removedCount}</Text>
                  </Pressable>
                </View>

                <View style={styles.searchWrap}>
                  <View
                    style={[
                      styles.search,
                      {
                        backgroundColor: theme.colors.background + "b8",
                        borderColor: theme.colors.border + "88",
                      },
                    ]}
                  >
                    <FeatherIcon name="search" size={14} color={theme.colors.textTertiary} />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Search model name or provider"
                      placeholderTextColor={theme.colors.textTertiary}
                      style={[styles.searchInput, { color: theme.colors.text }]}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {query.length > 0 ? (
                      <Pressable onPress={() => setQuery("")} style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}>
                        <FeatherIcon name="x" size={14} color={theme.colors.textSecondary} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <SectionList
                  sections={sections}
                  keyExtractor={(item) => item.key}
                  renderSectionHeader={({ section }) => (
                    <View style={[styles.sectionHeader, { borderTopColor: theme.colors.border + "44" }]}>
                      <Text style={[styles.sectionName, { color: theme.colors.textSecondary }]}>{section.providerName}</Text>
                      <Text style={[styles.sectionCount, { color: theme.colors.textTertiary }]}>{section.data.length}</Text>
                    </View>
                  )}
                  renderItem={({ item }) => (
                    <PickerRow
                      item={item}
                      selected={selected === item.key}
                      onSelect={handleSelect}
                      onFavorite={handleFavorite}
                      onRemove={handleRemove}
                      onRestore={handleRestore}
                      theme={theme}
                    />
                  )}
                  ListHeaderComponent={
                    <Pressable
                      style={({ pressed }) => [
                        styles.defaultRow,
                        {
                          borderColor: theme.colors.border + "99",
                          backgroundColor: !current ? theme.colors.accent + "12" : "transparent",
                        },
                        pressed && styles.pressed,
                      ]}
                      onPress={handleDefault}
                    >
                      <View style={styles.defaultCopy}>
                        <Text style={[styles.defaultName, { color: theme.colors.text }]}>Default</Text>
                        <Text style={[styles.defaultHint, { color: theme.colors.textSecondary }]}>Auto-select best available model</Text>
                      </View>
                      {!current ? <FeatherIcon name="check" size={15} color={theme.colors.accent} /> : null}
                    </Pressable>
                  }
                  ListEmptyComponent={
                    <View style={styles.empty}>
                      <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>{emptyText}</Text>
                    </View>
                  }
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                  stickySectionHeadersEnabled={false}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                />
              </View>
            </BlurView>
          </AnimatedView>
        </View>
      </View>
    </Modal>
  )
}

const PickerRow = memo(function PickerRow({
  item,
  selected,
  onSelect,
  onFavorite,
  onRemove,
  onRestore,
  theme,
}: {
  item: ModelItem
  selected: boolean
  onSelect: (item: ModelItem) => void
  onFavorite: (item: ModelItem) => void
  onRemove: (item: ModelItem) => void
  onRestore: (item: ModelItem) => void
  theme: Theme
}) {
  return (
    <View style={[styles.row, { borderTopColor: theme.colors.border + "44" }]}>
      <Pressable
        style={({ pressed }) => [
          styles.rowMain,
          selected && { backgroundColor: theme.colors.accent + "15" },
          pressed && { backgroundColor: theme.colors.surfaceRaised + "80" },
          item.removed && { opacity: 0.54 },
        ]}
        onPress={() => onSelect(item)}
        disabled={item.removed}
      >
        <View style={styles.rowCopy}>
          <Text style={[styles.modelName, { color: theme.colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.modelMeta}>
            <Text style={[styles.modelInfo, { color: theme.colors.textTertiary }]} numberOfLines={1}>
              {item.providerName} • {item.id}
            </Text>
            {item.reasoning ? (
              <View style={[styles.badge, { backgroundColor: theme.colors.accent + "22" }]}>
                <Text style={[styles.badgeText, { color: theme.colors.accent }]}>reasoning</Text>
              </View>
            ) : null}
            {item.removed ? (
              <View style={[styles.badge, { backgroundColor: theme.colors.error + "22" }]}>
                <Text style={[styles.badgeText, { color: theme.colors.error }]}>removed</Text>
              </View>
            ) : null}
          </View>
        </View>
        {selected ? <FeatherIcon name="check" size={15} color={theme.colors.accent} /> : null}
      </Pressable>
      <View style={styles.rowActions}>
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: theme.colors.surfaceRaised + "99", borderColor: theme.colors.border + "99" },
            pressed && styles.pressed,
          ]}
          onPress={() => onFavorite(item)}
          accessibilityLabel={item.favorite ? "Remove favorite" : "Add favorite"}
        >
          <IonIcon name={item.favorite ? "star" : "star-outline"} size={14} color={item.favorite ? theme.colors.warning : theme.colors.textTertiary} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: theme.colors.surfaceRaised + "99", borderColor: theme.colors.border + "99" },
            pressed && styles.pressed,
          ]}
          onPress={() => (item.removed ? onRestore(item) : onRemove(item))}
          accessibilityLabel={item.removed ? "Restore model" : "Remove model"}
        >
          <FeatherIcon name={item.removed ? "rotate-ccw" : "minus"} size={14} color={item.removed ? theme.colors.success : theme.colors.textTertiary} />
        </Pressable>
      </View>
    </View>
  )
})

export function ModelPickerIconButton({
  onPress,
  variant = "icon",
}: {
  onPress: (point: ModelPoint) => void
  variant?: PickerButtonVariant
}) {
  const theme = useTheme()
  const activeName = useSettings(modelName)

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      onPress({
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      })
    },
    [onPress],
  )

  if (variant === "pill") {
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.pillButton,
          {
            backgroundColor: theme.colors.surfaceRaised + "cc",
            borderColor: theme.colors.border + "aa",
          },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Pick model"
      >
        <IonIcon name="sparkles-outline" size={13} color={theme.colors.accent} />
        <Text style={[styles.pillLabel, { color: theme.colors.text }]} numberOfLines={1}>
          {activeName}
        </Text>
        <FeatherIcon name="chevron-down" size={13} color={theme.colors.textTertiary} />
      </Pressable>
    )
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: theme.colors.surfaceRaised + "cc",
          borderColor: theme.colors.border + "aa",
        },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Pick model"
    >
      <IonIcon name="sparkles-outline" size={16} color={theme.colors.text} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetWrap: {
    alignItems: "center",
    paddingHorizontal: SHEET_HORIZONTAL_PADDING,
  },
  sheet: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 30,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.18,
        shadowRadius: 26,
      },
      android: {
        elevation: 9,
      },
    }),
  },
  sheetBlur: {
    flex: 1,
  },
  sheetTone: {
    flex: 1,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  filters: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  filterCount: {
    fontSize: 11,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  search: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
  },
  clearButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  defaultRow: {
    marginHorizontal: 16,
    marginBottom: 2,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  defaultCopy: {
    flex: 1,
    gap: 2,
  },
  defaultName: {
    fontSize: 14,
    fontWeight: "600",
  },
  defaultHint: {
    fontSize: 12,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 14,
  },
  sectionHeader: {
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 5,
  },
  sectionName: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  sectionCount: {
    fontSize: 11,
  },
  empty: {
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
  },
  row: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 58,
  },
  rowMain: {
    flex: 1,
    minHeight: 54,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 10,
  },
  rowCopy: {
    flex: 1,
    gap: 3,
  },
  modelName: {
    fontSize: 14,
    fontWeight: "600",
  },
  modelMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  modelInfo: {
    fontSize: 11,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  rowActions: {
    flexDirection: "row",
    gap: 6,
    paddingLeft: 6,
  },
  actionButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pillButton: {
    maxWidth: 232,
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.7,
  },
})
