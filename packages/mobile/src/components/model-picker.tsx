import { useState, useMemo, useCallback, memo } from "react"
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
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

type ModelKey = { providerID: string; modelID: string }

type ModelItem = {
  id: string
  name: string
  providerID: string
  providerName: string
  reasoning: boolean
}

type Props = {
  visible: boolean
  onClose: () => void
}

export function ModelPicker({ visible, onClose }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const providerData = useSettings((s) => s.providerData)
  const current = useSettings((s) => s.model)
  const setModel = useSettings((s) => s.setModel)
  const [query, setQuery] = useState("")

  const models = useMemo(() => {
    if (!providerData) return []
    const connected = new Set(providerData.connected)
    const q = query.toLowerCase()
    const result: ModelItem[] = []

    for (const provider of providerData.all) {
      if (!connected.has(provider.id)) continue

      for (const [key, info] of Object.entries(provider.models)) {
        if (info.status === "deprecated") continue
        if (!info.tool_call) continue
        const name = info.name || key
        if (q && !name.toLowerCase().includes(q) && !provider.name.toLowerCase().includes(q)) continue
        result.push({
          id: info.id || key,
          name,
          providerID: provider.id,
          providerName: provider.name || provider.id,
          reasoning: info.reasoning,
        })
      }
    }

    // Sort: popular providers first, then alpha
    const popular = ["anthropic", "openai", "google", "openrouter"]
    result.sort((a, b) => {
      const ai = popular.indexOf(a.providerID)
      const bi = popular.indexOf(b.providerID)
      if (ai >= 0 && bi < 0) return -1
      if (ai < 0 && bi >= 0) return 1
      if (ai >= 0 && bi >= 0 && ai !== bi) return ai - bi
      if (a.providerID !== b.providerID) return a.providerName.localeCompare(b.providerName)
      return a.name.localeCompare(b.name)
    })

    return result
  }, [providerData, query])

  const handleSelect = useCallback(
    (item: ModelItem) => {
      Haptics.selectionAsync()
      setModel({ providerID: item.providerID, modelID: item.id })
      onClose()
    },
    [onClose],
  )

  const handleDefault = useCallback(() => {
    Haptics.selectionAsync()
    setModel(null)
    onClose()
  }, [onClose])

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

          <FlatList
            data={models}
            keyExtractor={(item) => `${item.providerID}:${item.id}`}
            renderItem={({ item }) => (
              <PickerRow
                item={item}
                selected={selected === `${item.providerID}:${item.id}`}
                onSelect={handleSelect}
                theme={theme}
              />
            )}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
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
          <Text style={[styles.provider, { color: theme.colors.textTertiary }]}>{item.providerName}</Text>
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
  const label = useSettings(modelName)

  return (
    <Pressable style={styles.trigger} onPress={onPress} hitSlop={8}>
      <Text style={[styles.triggerText, { color: theme.colors.textTertiary }]} numberOfLines={1}>
        {label}
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
    paddingHorizontal: 2,
    marginBottom: 4,
  },
  triggerText: {
    fontSize: 12,
    fontWeight: "500",
    maxWidth: 200,
  },
  triggerChevron: {
    fontSize: 9,
    marginLeft: 3,
  },
})
