import { View, Text, Pressable } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StyleSheet } from "react-native-unistyles"
import { Composer } from "@/components/chat/composer"
import { useProject } from "@/api/hooks"

/**
 * Empty session state — shown when no session is selected.
 * Displays project name and a prompt to start or select a session.
 * The composer at the bottom allows creating a new session by typing.
 */
export default function SessionIndex() {
  const insets = useSafeAreaInsets()
  const project = useProject()

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.center}>
        <Text style={styles.title}>{project?.name ?? "opencode"}</Text>
        <Text style={styles.subtitle}>Start a new conversation or select one from the sidebar</Text>
      </View>
      <Composer style={{ paddingBottom: insets.bottom }} />
    </View>
  )
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  title: {
    fontSize: theme.typography.size.xxl,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginTop: theme.spacing.sm,
  },
}))
