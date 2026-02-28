import { useMemo, useCallback, memo, useState, useEffect, useRef } from "react"
import {
  View,
  Text,
  Pressable,
  SectionList,
  StyleSheet,
  Modal,
  useWindowDimensions,
  Platform,
  TextInput,
  type GestureResponderEvent,
} from "react-native"
import { BlurView } from "expo-blur"
import { LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as Haptics from "expo-haptics"
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated"
import { useSettings, modelName, modelKey } from "../store/settings"
import { useTheme, type Theme } from "../theme"

const AnimatedView = Animated.View as React.ComponentType<{ style?: unknown; children?: React.ReactNode }>

export type ModelPoint = {
  x: number
  y: number
}

type ModelItem = {
  key: string
  id: string
  name: string
  searchText: string
  providerID: string
  providerName: string
  reasoning: boolean
  favorite: boolean
  removed: boolean
}

type ModelSection = {
  providerID: string
  providerName: string
  favorite: boolean
  data: ModelItem[]
}

type Props = {
  visible: boolean
  onClose: () => void
  anchor?: ModelPoint | null
}

const POPULAR_PROVIDERS = ["opencode", "anthropic", "github-copilot", "openai", "google", "openrouter", "vercel"] as const
const PICKER_HORIZONTAL_MARGIN = 36
const PICKER_VERTICAL_MARGIN = 72
const PICKER_MAX_WIDTH = 520
const PICKER_MAX_HEIGHT = 640

function compareProviderOrder(aID: string, aName: string, bID: string, bName: string) {
  const ai = POPULAR_PROVIDERS.indexOf(aID as (typeof POPULAR_PROVIDERS)[number])
  const bi = POPULAR_PROVIDERS.indexOf(bID as (typeof POPULAR_PROVIDERS)[number])
  const aPopular = ai >= 0
  const bPopular = bi >= 0
  if (aPopular && !bPopular) return -1
  if (!aPopular && bPopular) return 1
  if (aPopular && bPopular && ai !== bi) return ai - bi
  return aName.localeCompare(bName)
}

function compareModelOrder(a: ModelItem, b: ModelItem) {
  if (a.favorite && !b.favorite) return -1
  if (!a.favorite && b.favorite) return 1

  const name = a.name.localeCompare(b.name)
  if (name !== 0) return name
  return a.id.localeCompare(b.id)
}

function compareSectionOrder(a: ModelSection, b: ModelSection) {
  if (a.favorite && !b.favorite) return -1
  if (!a.favorite && b.favorite) return 1
  return compareProviderOrder(a.providerID, a.providerName, b.providerID, b.providerName)
}

export function ModelPicker({ visible, onClose, anchor = null }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const providerData = useSettings((s) => s.providerData)
  const current = useSettings((s) => s.model)
  const setModel = useSettings((s) => s.setModel)
  const favorites = useSettings((s) => s.favorites)
  const removed = useSettings((s) => s.removed)
  const toggleFavorite = useSettings((s) => s.toggleFavorite)
  const removeModel = useSettings((s) => s.removeModel)
  const restoreModel = useSettings((s) => s.restoreModel)
  const activeName = useSettings(modelName)
  const [query, setQuery] = useState("")
  const [showRemoved, setShowRemoved] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const closing = useRef(false)

  const panel = useSharedValue(0)
  const shade = useSharedValue(0)

  const popupWidth = Math.min(windowWidth - PICKER_HORIZONTAL_MARGIN, PICKER_MAX_WIDTH)
  const popupHeight = Math.min(windowHeight - insets.top - insets.bottom - PICKER_VERTICAL_MARGIN, PICKER_MAX_HEIGHT)
  const isDark = theme.colors.background === "#09090b"
  const panelTint = theme.colors.background + (isDark ? "cc" : "dc")
  const panelBorder = theme.colors.border + (isDark ? "99" : "88")

  const centerX = windowWidth / 2
  const centerY = windowHeight / 2
  const startX = anchor?.x ?? centerX
  const startY = anchor?.y ?? centerY
  const offsetX = startX - centerX
  const offsetY = startY - centerY

  useEffect(() => {
    if (visible) {
      closing.current = false
      panel.value = 0
      shade.value = 0
      shade.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) })
      panel.value = withSpring(1, {
        damping: 22,
        stiffness: 290,
        mass: 0.72,
        overshootClamping: false,
      })
      return
    }

    setQuery("")
    setShowRemoved(false)
  }, [panel, shade, visible])

  const finishClose = useCallback(() => {
    closing.current = false
    onClose()
  }, [onClose])

  const handleClose = useCallback(() => {
    if (closing.current) return
    closing.current = true
    panel.value = withTiming(0, {
      duration: 170,
      easing: Easing.bezier(0.18, 0.92, 0.2, 1),
    })
    shade.value = withTiming(
      0,
      {
        duration: 160,
        easing: Easing.out(Easing.quad),
      },
      (finished) => {
        if (finished) runOnJS(finishClose)()
      },
    )
  }, [finishClose, panel, shade])

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: shade.value,
  }))

  const popupStyle = useAnimatedStyle(
    () => ({
      opacity: panel.value,
      transform: [
        { translateX: offsetX * (1 - panel.value) },
        { translateY: offsetY * (1 - panel.value) },
        { scale: 0.82 + panel.value * 0.18 },
      ],
    }),
    [offsetX, offsetY],
  )

  const allModels = useMemo<ModelItem[]>(() => {
    if (!providerData) return []

    const connected = new Set(providerData.connected)
    const result: ModelItem[] = []

    for (const provider of providerData.all) {
      if (!connected.has(provider.id)) continue
      const providerName = provider.name || provider.id
      for (const [baseModelID, info] of Object.entries(provider.models)) {
        if (info.status === "deprecated") continue
        const id = info.id || baseModelID
        const name = info.name || id
        const key = modelKey({ providerID: provider.id, modelID: id })
        result.push({
          key,
          id,
          name,
          searchText: `${name} ${id} ${providerName} ${provider.id}`.toLowerCase(),
          providerID: provider.id,
          providerName,
          reasoning: info.reasoning,
          favorite: !!favorites[key],
          removed: !!removed[key],
        })
      }
    }

    return result
  }, [providerData, favorites, removed])

  const normalizedQuery = useMemo(() => query.trim().toLowerCase(), [query])

  const models = useMemo(() => {
    return allModels.filter((item) => {
      if (!showRemoved && item.removed) return false
      if (!normalizedQuery) return true
      return item.searchText.includes(normalizedQuery)
    })
  }, [allModels, normalizedQuery, showRemoved])

  const sections = useMemo<ModelSection[]>(() => {
    const map = new Map<string, ModelSection>()

    for (const item of models) {
      const section = map.get(item.providerID)
      if (!section) {
        map.set(item.providerID, {
          providerID: item.providerID,
          providerName: item.providerName,
          favorite: item.favorite,
          data: [item],
        })
        continue
      }

      section.data.push(item)
      if (item.favorite) section.favorite = true
    }

    return Array.from(map.values())
      .map((section) => ({
        ...section,
        data: section.data.sort(compareModelOrder),
      }))
      .sort(compareSectionOrder)
  }, [models])

  const selected = current ? modelKey(current) : null
  const favoriteCount = useMemo(() => allModels.filter((item) => item.favorite).length, [allModels])
  const removedCount = useMemo(() => allModels.filter((item) => item.removed).length, [allModels])

  const visibleSections = useMemo(
    () => sections.map((section) => (collapsed[section.providerID] ? { ...section, data: [] } : section)),
    [collapsed, sections],
  )

  const sectionCount = useMemo(
    () => Object.fromEntries(sections.map((section) => [section.providerID, section.data.length])),
    [sections],
  )

  const selectedProvider = useMemo(() => {
    if (!current || !providerData) return "Default"
    return providerData.all.find((provider) => provider.id === current.providerID)?.name || current.providerID
  }, [current, providerData])

  const emptyText = useMemo(() => {
    if (!providerData) return "Loading models..."
    if (!allModels.length) return "No models available"
    if (query.trim()) return "No models match your search"
    if (!showRemoved && removedCount > 0) return "No visible models. Show removed to restore."
    return "No models available"
  }, [allModels.length, providerData, query, removedCount, showRemoved])

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

  const handleRemovedToggle = useCallback(() => {
    void Haptics.selectionAsync()
    setShowRemoved((state) => !state)
  }, [])

  const toggleProvider = useCallback((providerID: string) => {
    void Haptics.selectionAsync()
    setCollapsed((state) => ({
      ...state,
      [providerID]: !state[providerID],
    }))
  }, [])

  const Glass = LiquidGlassView as React.ComponentType<{
    interactive?: boolean
    style?: unknown
    children?: React.ReactNode
  }>

  const content = (
    <>
      <View style={[styles.header, { borderBottomColor: theme.colors.border + "50" }]}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Choose model</Text>
          <Text style={[styles.currentModel, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            Current: {activeName}
          </Text>
          <Text style={[styles.currentProvider, { color: theme.colors.textTertiary }]} numberOfLines={1}>
            {selectedProvider}
          </Text>
        </View>
        <Pressable
          onPress={handleClose}
          style={styles.closeButton}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close model picker"
        >
          <Text style={[styles.closeGlyph, { color: theme.colors.textTertiary }]}>{"\u2715"}</Text>
        </Pressable>
      </View>

      <View style={[styles.searchWrap, { borderBottomColor: theme.colors.border + "60" }]}>
        <View style={[styles.search, { backgroundColor: theme.colors.surface + "d0", borderColor: theme.colors.border + "66" }]}>
          <Text style={[styles.searchIcon, { color: theme.colors.textTertiary }]}>{"\u2315"}</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search models"
            placeholderTextColor={theme.colors.textTertiary}
            style={[styles.searchInput, { color: theme.colors.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search models"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <Text style={[styles.clear, { color: theme.colors.textTertiary }]}>{"\u2715"}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable
          style={[styles.control, { backgroundColor: theme.colors.surface + "cc", borderColor: theme.colors.border + "66" }]}
          onPress={handleDefault}
        >
          <Text style={[styles.controlLabel, { color: theme.colors.text }]}>Default</Text>
          {!current && <Text style={[styles.controlValue, { color: theme.colors.accent }]}>{"\u2713"}</Text>}
        </Pressable>
        <Pressable
          style={[styles.control, { backgroundColor: theme.colors.surface + "cc", borderColor: theme.colors.border + "66" }]}
          onPress={handleRemovedToggle}
          disabled={removedCount === 0}
        >
          <Text style={[styles.controlLabel, { color: removedCount ? theme.colors.text : theme.colors.textTertiary }]}>
            {showRemoved ? "Hide removed" : "Show removed"}
          </Text>
          <Text style={[styles.controlValue, { color: theme.colors.textTertiary }]}>{removedCount}</Text>
        </Pressable>
      </View>

      <View style={styles.summary}>
        <Text style={[styles.summaryText, { color: theme.colors.textTertiary }]}>
          {models.length} visible • {favoriteCount} favorites • {allModels.length} total
        </Text>
      </View>

      <SectionList
        sections={visibleSections}
        keyExtractor={(item) => item.key}
        renderSectionHeader={({ section }) => (
          <Pressable
            style={[styles.sectionHeader, { borderTopColor: theme.colors.border + "33" }]}
            onPress={() => toggleProvider(section.providerID)}
            accessibilityRole="button"
            accessibilityLabel={`Toggle ${section.providerName} models`}
          >
            <View style={styles.sectionLeft}>
              <Text style={[styles.sectionChevron, { color: theme.colors.textTertiary }]}>
                {collapsed[section.providerID] ? "\u25B8" : "\u25BE"}
              </Text>
              <Text style={[styles.sectionName, { color: theme.colors.textSecondary }]}>{section.providerName}</Text>
            </View>
            <Text style={[styles.sectionCount, { color: theme.colors.textTertiary }]}>{sectionCount[section.providerID] ?? 0}</Text>
          </Pressable>
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
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>{emptyText}</Text>
          </View>
        }
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        scrollEnabled
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
      />
    </>
  )

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.modalRoot}>
        <AnimatedView style={[styles.backdrop, backdropStyle]}>
          <Pressable style={styles.backdropPress} onPress={handleClose}>
            <View />
          </Pressable>
        </AnimatedView>
        <View style={[styles.center, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
          <AnimatedView style={popupStyle}>
            <View
              style={[
                styles.popup,
                {
                  width: popupWidth,
                  height: popupHeight,
                },
              ]}
            >
              {isLiquidGlassSupported ? (
                <Glass style={[styles.surface, { borderRadius: 24, borderColor: panelBorder }]}>
                  <View style={[styles.surfaceTone, { backgroundColor: panelTint }]}>{content}</View>
                </Glass>
              ) : (
                <BlurView
                  intensity={92}
                  tint={isDark ? "dark" : "light"}
                  style={[styles.surface, { borderRadius: 20, borderColor: panelBorder }]}
                >
                  <View style={[styles.surfaceTone, { backgroundColor: panelTint }]}>{content}</View>
                </BlurView>
              )}
            </View>
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
  const removeLabel = item.removed ? "Restore model" : "Remove model"
  return (
    <View style={[styles.row, { borderTopColor: theme.colors.border + "33" }]}>
      <Pressable
        style={({ pressed }) => [
          styles.rowMain,
          pressed && { backgroundColor: theme.colors.surfaceRaised + "70" },
          selected && { backgroundColor: theme.colors.accent + "16" },
          item.removed && { opacity: 0.5 },
        ]}
        onPress={() => onSelect(item)}
        disabled={item.removed}
      >
        <View style={styles.rowLeft}>
          <Text style={[styles.modelName, { color: theme.colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.meta}>
            <Text style={[styles.provider, { color: theme.colors.textTertiary }]} numberOfLines={1}>
              {item.providerName} • {item.id}
            </Text>
            {item.reasoning && (
              <View style={[styles.badge, { backgroundColor: theme.colors.accent + "20" }]}>
                <Text style={[styles.badgeText, { color: theme.colors.accent }]}>reasoning</Text>
              </View>
            )}
            {item.removed && (
              <View style={[styles.badge, { backgroundColor: theme.colors.warning + "18" }]}>
                <Text style={[styles.badgeText, { color: theme.colors.warning }]}>removed</Text>
              </View>
            )}
          </View>
        </View>
        {selected && <Text style={[styles.check, { color: theme.colors.accent }]}>{"\u2713"}</Text>}
      </Pressable>
      <View style={styles.rowActions}>
        <Pressable
          style={[styles.actionButton, { backgroundColor: theme.colors.surface + "cc", borderColor: theme.colors.border + "66" }]}
          onPress={() => onFavorite(item)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={item.favorite ? "Remove favorite" : "Add favorite"}
        >
          <Text style={[styles.actionGlyph, { color: item.favorite ? theme.colors.warning : theme.colors.textTertiary }]}>
            {item.favorite ? "\u2605" : "\u2606"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, { backgroundColor: theme.colors.surface + "cc", borderColor: theme.colors.border + "66" }]}
          onPress={() => (item.removed ? onRestore(item) : onRemove(item))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={removeLabel}
        >
          <Text style={[styles.actionGlyph, { color: item.removed ? theme.colors.success : theme.colors.textTertiary }]}>
            {item.removed ? "\u21BA" : "\u2212"}
          </Text>
        </Pressable>
      </View>
    </View>
  )
})

export function ModelPickerIconButton({ onPress }: { onPress: (point: ModelPoint) => void }) {
  const theme = useTheme()

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      onPress({
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      })
    },
    [onPress],
  )

  return (
    <Pressable
      onPress={handlePress}
      style={styles.iconButton}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Pick model"
    >
      <Text style={[styles.iconGlyph, { color: theme.colors.text }]}>{"\u25CE"}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.24)",
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  popup: {
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  surface: {
    flex: 1,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  surfaceTone: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 19,
    fontWeight: "700",
  },
  currentModel: {
    fontSize: 13,
    marginTop: 3,
  },
  currentProvider: {
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  closeGlyph: {
    fontSize: 13,
    fontWeight: "600",
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 10,
    minHeight: 40,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
  },
  clear: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 4,
  },
  controls: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 1,
  },
  control: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  controlLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  controlValue: {
    fontSize: 12,
    fontWeight: "500",
  },
  summary: {
    paddingHorizontal: 16,
    paddingTop: 7,
    paddingBottom: 5,
  },
  summaryText: {
    fontSize: 11,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  sectionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionChevron: {
    fontSize: 10,
    width: 10,
  },
  sectionName: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: "500",
  },
  empty: {
    paddingVertical: 34,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
  },
  row: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: 8,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rowLeft: {
    flex: 1,
    gap: 3,
  },
  modelName: {
    fontSize: 14,
    fontWeight: "500",
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  provider: {
    fontSize: 11,
  },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "500",
  },
  check: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 6,
  },
  actionButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    alignItems: "center",
  },
  actionGlyph: {
    fontSize: 15,
    fontWeight: "600",
    marginTop: -1,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  iconGlyph: {
    fontSize: 18,
    fontWeight: "500",
    marginTop: -1,
  },
})
