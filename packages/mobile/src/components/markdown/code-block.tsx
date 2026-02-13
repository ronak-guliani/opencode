import { memo, useCallback } from "react"
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native"
import * as Clipboard from "expo-clipboard"
import { useTheme } from "../../theme"

type Props = {
  code: string
  language?: string
}

export const CodeBlock = memo(function CodeBlock({ code, language }: Props) {
  const theme = useTheme()

  const copy = useCallback(() => {
    Clipboard.setStringAsync(code)
  }, [code])

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.codeBackground, borderRadius: theme.radii.md }]}>
      <View style={[styles.header, { borderBottomColor: theme.colors.codeBorder }]}>
        <Text style={[styles.language, { color: theme.colors.textTertiary }]}>{language || "text"}</Text>
        <Pressable onPress={copy} hitSlop={8}>
          <Text style={[styles.copy, { color: theme.colors.textTertiary }]}>Copy</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        <Text style={[styles.code, { color: theme.colors.codeText }]} selectable>
          {code}
        </Text>
      </ScrollView>
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  language: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "lowercase",
  },
  copy: {
    fontSize: 11,
    fontWeight: "500",
  },
  scroll: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  code: {
    fontFamily: "Geist Mono",
    fontSize: 13,
    lineHeight: 19,
  },
})
