import { useMemo, useCallback, memo, useState } from "react"
import { View, Text, Pressable, SectionList, StyleSheet, Modal, useWindowDimensions, Platform } from "react-native"
import { BlurView } from "expo-blur"
import { LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as Haptics from "expo-haptics"
import { useSettings, modelName } from "../store/settings"
import { useTheme, type Theme } from "../theme"

type ModelItem = {
  id: string
  name: string
  providerID: string
  providerName: string
  reasoning: boolean
}

type ModelSection = {
  providerID: string
  providerName: string
  data: ModelItem[]
}

type Props = {
  visible: boolean
  onClose: () => void
}

const POPULAR_PROVIDERS = ["opencode", "anthropic", "github-copilot", "openai", "google", "openrouter", "vercel"]

function compareProviderOrder(a: ModelSection, b: ModelSection) {
  const ai = POPULAR_PROVIDERS.indexOf(a.providerID)
  const bi = POPULAR_PROVIDERS.indexOf(b.providerID)
  const aPopular = ai >= 0
  const bPopular = bi >= 0
  if (aPopular && !bPopular) return -1
  if (!aPopular && bPopular) return 1
  if (aPopular && bPopular && ai !== bi) return ai - bi
  return a.providerName.localeCompare(b.providerName)
}

export function ModelPicker({ visible, onClose }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const providerData = useSettings((s) => s.providerData)
  const current = useSettings((s) => s.model)
  const setModel = useSettings((s) => s.setModel)
  const activeName = useSettings(modelName)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const sections = useMemo<ModelSection[]>(() => {
    if (!providerData) return []

    const connected = new Set(providerData.connected)
    const result: ModelSection[] = []

    for (const provider of providerData.all) {
      if (!connected.has(provider.id)) continue

      const models: ModelItem[] = []
      for (const [modelKey, info] of Object.entries(provider.models)) {
        if (info.status === "deprecated") continue
        const id = info.id || modelKey
        models.push({
          id,
          name: info.name || id,
          providerID: provider.id,
          providerName: provider.name || provider.id,
          reasoning: info.reasoning,
        })
      }

      if (!models.length) continue
      models.sort((a, b) => a.name.localeCompare(b.name))
      result.push({
        providerID: provider.id,
        providerName: provider.name || provider.id,
        data: models,
      })
    }

    result.sort(compareProviderOrder)
    return result
  }, [providerData])

  const selected = current ? `${current.providerID}:${current.modelID}` : null
  const sectionCountByProvider = useMemo(
    () =>
      Object.fromEntries(
        sections.map((section) => [
          section.providerID,
          section.data.length,
        ]),
      ) as Record<string, number>,
    [sections],
  )
  const visibleSections = useMemo(
    () => sections.map((section) => (collapsed[section.providerID] ? { ...section, data: [] } : section)),
    [sections, collapsed],
  )

  const selectedProvider = useMemo(() => {
    if (!current || !providerData) return "Default"
    return providerData.all.find((provider) => provider.id === current.providerID)?.name || current.providerID
  }, [current, providerData])

  const handleSelect = useCallback(
    (item: ModelItem) => {
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

  const popupWidth = Math.min(Math.max(windowWidth * 0.64, 260), 380)
  const popupHeight = Math.min(windowHeight * 0.52, 520)

  const toggleProvider = useCallback((providerID: string) => {
    Haptics.selectionAsync()
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
          <Text style={[styles.currentModel, { color: theme.colors.text }]} numberOfLines={1}>
            {activeName}
          </Text>
          <Text style={[styles.currentProvider, { color: theme.colors.textTertiary }]} numberOfLines={1}>
            {selectedProvider}
          </Text>
        </View>
        <Text style={[styles.chevron, { color: theme.colors.textTertiary }]}>{"\u25BE"}</Text>
      </View>

      <Pressable style={[styles.defaultRow, { borderBottomColor: theme.colors.border + "40" }]} onPress={handleDefault}>
        <Text style={[styles.defaultLabel, { color: theme.colors.text }]}>Default</Text>
        {!current && <Text style={[styles.check, { color: theme.colors.accent }]}>{"\u2713"}</Text>}
      </Pressable>

      <SectionList
        sections={visibleSections}
        keyExtractor={(item) => `${item.providerID}:${item.id}`}
        renderSectionHeader={({ section }) => {
          const isCollapsed = !!collapsed[section.providerID]
          return (
            <Pressable
              style={[styles.sectionHeader, { borderTopColor: theme.colors.border + "22" }]}
              onPress={() => toggleProvider(section.providerID)}
            >
              <Text style={[styles.sectionHeaderText, { color: theme.colors.textTertiary }]}>{section.providerName}</Text>
              <View style={styles.sectionMeta}>
                <Text style={[styles.sectionCount, { color: theme.colors.textTertiary }]}>
                  {sectionCountByProvider[section.providerID] ?? 0}
                </Text>
                <Text style={[styles.sectionChevron, { color: theme.colors.textTertiary }]}>
                  {isCollapsed ? "\u25B8" : "\u25BE"}
                </Text>
              </View>
            </Pressable>
          )
        }}
        renderItem={({ item }) => {
          const key = `${item.providerID}:${item.id}`
          return <PickerRow item={item} selected={selected === key} onSelect={handleSelect} theme={theme} />
        }}
        ListEmptyComponent={
          sections.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>
                {providerData ? "No models available" : "Loading models..."}
              </Text>
            </View>
          ) : null
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
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View />
      </Pressable>
      <View
        style={[
          styles.popup,
          {
            width: popupWidth,
            height: popupHeight,
            bottom: insets.bottom + 84,
            left: 12,
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
    </Modal>
  )
}

const PickerRow = memo(function PickerRow({
  item,
  selected,
  onSelect,
  theme,
}: {
  item: ModelItem
  selected: boolean
  onSelect: (item: ModelItem) => void
  theme: Theme
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: theme.colors.surfaceRaised + "70" },
        selected && { backgroundColor: theme.colors.accent + "16" },
      ]}
      onPress={() => onSelect(item)}
    >
      <View style={styles.rowLeft}>
        <Text style={[styles.modelName, { color: theme.colors.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.provider, { color: theme.colors.textTertiary }]}>{item.id}</Text>
          {item.reasoning && (
            <View style={[styles.badge, { backgroundColor: theme.colors.accent + "20" }]}>
              <Text style={[styles.badgeText, { color: theme.colors.accent }]}>reasoning</Text>
            </View>
          )}
        </View>
      </View>
      {selected && <Text style={[styles.check, { color: theme.colors.accent }]}>{"\u2713"}</Text>}
    </Pressable>
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.10)",
  },
  popup: {
    position: "absolute",
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: {
    flex: 1,
  },
  currentModel: {
    fontSize: 19,
    fontWeight: "700",
  },
  currentProvider: {
    fontSize: 12,
    marginTop: 2,
  },
  chevron: {
    fontSize: 14,
  },
  defaultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  defaultLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  sectionMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: "500",
  },
  sectionChevron: {
    fontSize: 10,
  },
  sectionHeaderText: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontWeight: "600",
  },
  empty: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowLeft: {
    flex: 1,
    gap: 2,
  },
  modelName: {
    fontSize: 14,
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
    paddingVertical: 1,
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
