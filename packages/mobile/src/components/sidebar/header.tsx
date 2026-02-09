import { View, Text } from "react-native"
import { StyleSheet } from "react-native-unistyles"
import { useProject } from "@/api/hooks"

/**
 * Sidebar header — shows project name and directory path.
 */
export function Header() {
  const project = useProject()

  return (
    <View style={styles.container}>
      <Text style={styles.name} numberOfLines={1}>
        {project?.name ?? "opencode"}
      </Text>
      {project?.path ? (
        <Text style={styles.path} numberOfLines={1}>
          {project.path}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create((theme) => ({
  container: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  name: {
    fontSize: theme.typography.size.lg,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.text,
  },
  path: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
  },
}))
