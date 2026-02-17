import { useMemo, useCallback, memo, useState, useEffect } from "react"
import { View, Text, Pressable, FlatList, StyleSheet, Modal, useWindowDimensions, Platform, TextInput } from "react-native"
import { BlurView } from "expo-blur"
import { LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as Haptics from "expo-haptics"
import { useSettings, modelName, modelKey } from "../store/settings"
import { useTheme, type Theme } from "../theme"

type ModelItem = {
  key: string
  id: string
  name: string
  providerID: string
  providerName: string
  reasoning: boolean
  favorite: boolean
  removed: boolean
}

type Props = {
  visible: boolean
  onClose: () => void
}

const POPULAR_PROVIDERS = ["opencode", "anthropic", "github-copilot", "openai", "google", "openrouter", "vercel"] as const

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

  const provider = compareProviderOrder(a.providerID, a.providerName, b.providerID, b.providerName)
  if (provider !== 0) return provider

  const name = a.name.localeCompare(b.name)
  if (name !== 0) return name
  return a.id.localeCompare(b.id)
}

export function ModelPicker({ visible, onClose }: Props) {
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

  useEffect(() => {
    if (visible) return
    setQuery("")
    setShowRemoved(false)
  }, [visible])

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
        const key = modelKey({ providerID: provider.id, modelID: id })
        result.push({
          key,
          id,
          name: info.name || id,
          providerID: provider.id,
          providerName,
          reasoning: info.reasoning,
          favorite: !!favorites[key],
          removed: !!removed[key],
        })
      }
    }

    return result.sort(compareModelOrder)
  }, [providerData, favorites, removed])

  const models = useMemo(() => {
    const value = query.trim().toLowerCase()
    return allModels.filter((item) => {
      if (!showRemoved && item.removed) return false
      if (!value) return true
      return `${item.name} ${item.id} ${item.providerName} ${item.providerID}`.toLowerCase().includes(value)
    })
  }, [allModels, query, showRemoved])

  const selected = current ? modelKey(current) : null
  const favoriteCount = useMemo(() => allModels.filter((item) => item.favorite).length, [allModels])
  const removedCount = useMemo(() => allModels.filter((item) => item.removed).length, [allModels])

  const popupWidth = Math.min(windowWidth - 24, 560)
  const popupHeight = Math.min(windowHeight - insets.top - insets.bottom - 24, 700)

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
      Haptics.selectionAsync()
      setModel({ providerID: item.providerID, modelID: item.id })
      onClose()
    },
    [onClose, setModel],
  )

  const handleDefault = useCallback(() => {
    Haptics.selectionAsync()
    setModel(null)
    onClose()
  }, [onClose, setModel])

  const handleFavorite = useCallback((item: ModelItem) => {
    Haptics.selectionAsync()
    toggleFavorite({ providerID: item.providerID, modelID: item.id })
  }, [toggleFavorite])

  const handleRemove = useCallback((item: ModelItem) => {
    Haptics.selectionAsync()
    removeModel({ providerID: item.providerID, modelID: item.id })
  }, [removeModel])

  const handleRestore = useCallback((item: ModelItem) => {
    Haptics.selectionAsync()
    restoreModel({ providerID: item.providerID, modelID: item.id })
  }, [restoreModel])

  const handleRemovedToggle = useCallback(() => {
    Haptics.selectionAsync()
    setShowRemoved((state) => !state)
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
        <Pressable onPress={onClose} style={styles.closeButton} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close model picker">
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

      <FlatList
        data={models}
        keyExtractor={(item) => item.key}
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
      />
    </>
  )

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <View />
        </Pressable>
        <View style={[styles.center, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
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
              <Glass style={[styles.surface, { borderRadius: 28 }]}>
                {content}
              </Glass>
            ) : (
              <BlurView
                intensity={80}
                tint={theme.colors.background === "#09090b" ? "dark" : "light"}
                style={[styles.surface, { borderRadius: 20, borderColor: theme.colors.border + "70" }]}
              >
                {content}
              </BlurView>
            )}
          </View>
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

export function ModelPickerIconButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme()
  return (
    <Pressable
      onPress={onPress}
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
    backgroundColor: "rgba(0,0,0,0.16)",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
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
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 10,
    minHeight: 42,
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
    paddingTop: 2,
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
    paddingTop: 9,
    paddingBottom: 6,
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
    paddingVertical: 10,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  iconGlyph: {
    fontSize: 20,
    fontWeight: "500",
    marginTop: -1,
  },
})
