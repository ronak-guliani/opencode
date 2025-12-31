import { useEffect, useRef, memo } from "react"
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useToastStore, type Toast } from "@/store/toast"

const ToastItem = memo(({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) => {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(-20)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start()
  }, [opacity, translateY])

  const backgroundColor =
    toast.type === "error" ? "#DC2626" : toast.type === "success" ? "#16A34A" : "#3B82F6"

  return (
    <Animated.View
      style={[styles.toast, { backgroundColor, opacity, transform: [{ translateY }] }]}
    >
      <Text style={styles.message} numberOfLines={2}>
        {toast.message}
      </Text>
      <View style={styles.actions}>
        {toast.action && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              toast.action?.onPress()
              onDismiss()
            }}
          >
            <Text style={styles.actionText}>{toast.action.label}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
          <Text style={styles.dismissText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  )
})

export const ToastContainer = () => {
  const insets = useSafeAreaInsets()
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <View style={[styles.container, { top: insets.top + 8 }]} pointerEvents="box-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  message: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    marginRight: 12,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  dismissButton: {
    padding: 4,
  },
  dismissText: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 16,
    fontWeight: "500",
  },
})
