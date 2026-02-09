import { View, Text, Pressable } from "react-native"
import { useNavigation } from "expo-router"
import { DrawerActions } from "@react-navigation/native"
import { StyleSheet } from "react-native-unistyles"
import type { Session, SessionStatus } from "@opencode-ai/sdk/client"

/**
 * Chat header bar — shows session title, status, and menu button.
 * Tapping the menu button opens the drawer.
 */
export function ChatHeader({ session, status }: { session: Session; status?: SessionStatus }) {
  const navigation = useNavigation()

  function openDrawer() {
    navigation.dispatch(DrawerActions.openDrawer())
  }

  const busy = status?.type === "busy"

  return (
    <View style={styles.container}>
      <Pressable onPress={openDrawer} hitSlop={12} style={styles.menu}>
        <Text style={styles.menuIcon}>☰</Text>
      </Pressable>
      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {session.title || "New Session"}
        </Text>
        {busy ? <Text style={styles.status}>Thinking...</Text> : null}
      </View>
      <View style={styles.spacer} />
    </View>
  )
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  menu: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  menuIcon: {
    fontSize: theme.typography.size.xl,
    color: theme.colors.text,
  },
  center: {
    flex: 1,
    alignItems: "center",
  },
  title: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.semibold,
    color: theme.colors.text,
  },
  status: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.busy,
    marginTop: 2,
  },
  spacer: {
    width: 36,
  },
}))
