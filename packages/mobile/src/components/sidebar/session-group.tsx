import { Text } from "react-native"
import { StyleSheet } from "react-native-unistyles"

/**
 * Date group header in the sidebar session list.
 * Renders labels like "Today", "Yesterday", "This Week", etc.
 */
export function SessionGroup({ label }: { label: string }) {
  return <Text style={styles.label}>{label}</Text>
}

const styles = StyleSheet.create((theme) => ({
  label: {
    fontSize: theme.typography.size.xs,
    fontWeight: theme.typography.weight.medium,
    color: theme.colors.textTertiary,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
}))
