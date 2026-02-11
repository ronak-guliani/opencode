import { useState, useMemo, useCallback, memo, useEffect } from "react"
import {
  View,
  Text,
  TextInput,
  Pressable,
  SectionList,
  StyleSheet,
  Modal,
  useWindowDimensions,
  Platform,
} from "react-native"
import { BlurView } from "expo-blur"
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
  const { height: windowHeight } = useWindowDimensions()
  const providerData = useSettings((s) => s.providerData)
  const current = useSettings((s) => s.model)
  const setModel = useSettings((s) => s.setModel)
  const [query, setQuery] = useState("")

  const sections = useMemo<ModelSection[]>(() => {
    if (!providerData) return []

    const connected = new Set(providerData.connected)
    const q = query.trim().toLowerCase()
    const result: ModelSection[] = []

    for (const provider of providerData.all) {
      if (!connected.has(provider.id)) continue
      const providerName = provider.name || provider.id
      const providerMatches =
        q.length > 0 && (providerName.toLowerCase().includes(q) || provider.id.toLowerCase().includes(q))
      const models: ModelItem[] = []

      for (const [modelKey, info] of Object.entries(provider.models)) {
        if (info.status === "deprecated") continue
        const id = info.id || modelKey
        const name = info.name || id
        const matches = name.toLowerCase().includes(q) || id.toLowerCase().includes(q)
        if (q && !providerMatches && !matches) continue
        models.push({
          id,
          name,
          providerID: provider.id,
          providerName,
          reasoning: info.reasoning,
        })
      }

      if (!models.length) continue
      models.sort((a, b) => a.name.localeCompare(b.name))
      result.push({
        providerID: provider.id,
        providerName,
        data: models,
      })
    }

    result.sort(compareProviderOrder)
    return result
  }, [providerData, query])

  useEffect(() => {
    if (!visible) setQuery("")
  }, [visible])

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

  const selected = current ? `${current.providerID}:${current.modelID}` : null

  // Popup height: max 60% of window, minimum 300
  const popupHeight = Math.min(windowHeight * 0.6, 480)

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View />
      </Pressable>
      <View
        style={[
          styles.popup,
          {
            maxHeight: popupHeight,
            bottom: insets.bottom + 80,
            left: 12,
            right: 12,
          },
        ]}
      >
        <BlurView
          intensity={80}
          tint={theme.colors.background === "#09090b" ? "dark" : "light"}
          style={[styles.glass, { borderColor: theme.colors.border + "60" }]}
        >
          <View style={[styles.searchRow, { borderBottomColor: theme.colors.border + "40" }]}>
            <TextInput
              style={[styles.searchInput, { color: theme.colors.text }]}
              value={query}
              onChangeText={setQuery}
              placeholder="Search models..."
              placeholderTextColor={theme.colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              returnKeyType="search"
              autoFocus
            />
          </View>

          <Pressable
            style={[styles.defaultRow, { borderBottomColor: theme.colors.border + "30" }]}
            onPress={handleDefault}
          >
            <Text style={[styles.defaultLabel, { color: theme.colors.text }]}>Default</Text>
            {!current && <Text style={[styles.check, { color: theme.colors.accent }]}>{"\u2713"}</Text>}
          </Pressable>

          <SectionList
            sections={sections}
            keyExtractor={(item) => `${item.providerID}:${item.id}`}
            renderSectionHeader={({ section }) => (
              <View style={[styles.sectionHeader, { borderTopColor: theme.colors.border + "22" }]}>
                <Text style={[styles.sectionHeaderText, { color: theme.colors.textTertiary }]}>{section.providerName}</Text>
              </View>
            )}
            renderItem={({ item }) => {
              const key = `${item.providerID}:${item.id}`
              return <PickerRow item={item} selected={selected === key} onSelect={handleSelect} theme={theme} />
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>
                  {providerData ? "No models found" : "Loading models..."}
                </Text>
              </View>
            }
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
          />
        </BlurView>
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
        pressed && { backgroundColor: theme.colors.surfaceRaised + "80" },
        selected && { backgroundColor: theme.colors.accent + "15" },
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

export function ModelPickerTrigger({ onPress }: { onPress: () => void }) {
  const theme = useTheme()
  const providerData = useSettings((s) => s.providerData)
  const current = useSettings((s) => s.model)
  const label = useSettings(modelName)
  const display = useMemo(() => {
    if (!current) return "Default model"
    const provider = providerData?.all.find((item) => item.id === current.providerID)
    const providerName = provider?.name || current.providerID
    return `${providerName} · ${label}`
  }, [providerData, current, label])

  return (
    <Pressable style={[styles.trigger, { backgroundColor: theme.colors.surfaceRaised + "99" }]} onPress={onPress} hitSlop={8}>
      <Text style={[styles.triggerText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
        {display}
      </Text>
      <Text style={[styles.triggerChevron, { color: theme.colors.textTertiary }]}>{"\u25BE"}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  popup: {
    position: "absolute",
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  glass: {
    flex: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  searchRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  searchInput: {
    fontSize: 15,
    paddingVertical: 12,
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
  sectionHeader: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
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
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "90%",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
  },
  triggerText: {
    fontSize: 11,
    fontWeight: "500",
    maxWidth: 260,
  },
  triggerChevron: {
    fontSize: 9,
    marginLeft: 6,
  },
})
