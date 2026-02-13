import { memo, useMemo } from "react"
import { Text, StyleSheet, Linking, type TextStyle, type ViewStyle } from "react-native"
import MarkdownBase from "react-native-markdown-display"
import { useTheme, type Theme } from "../../theme"
import { CodeBlock } from "./code-block"

type Props = {
  children: string
}

// Cast for React 19 JSX compatibility
const Markdown = MarkdownBase as React.ComponentType<{
  rules?: Record<string, unknown>
  style?: Record<string, TextStyle | ViewStyle>
  children?: React.ReactNode
}>

function rules(theme: Theme) {
  return {
    fence: (node: { key: string; sourceInfo?: string; content?: string }) => {
      const lang = node.sourceInfo || ""
      const code = node.content?.replace(/\n$/, "") ?? ""
      return <CodeBlock key={node.key} code={code} language={lang} />
    },
    code_inline: (node: { key: string; content?: string }) => (
      <Text
        key={node.key}
        style={{
          fontFamily: "Geist Mono",
          fontSize: 13,
          backgroundColor: theme.colors.codeInline,
          color: theme.colors.codeInlineText,
          paddingHorizontal: 4,
          paddingVertical: 1,
          borderRadius: 4,
        }}
      >
        {node.content}
      </Text>
    ),
    link: (node: { key: string; attributes?: { href?: string } }, children: React.ReactNode) => (
      <Text
        key={node.key}
        style={{ color: theme.colors.link, textDecorationLine: "underline" }}
        onPress={() => {
          if (node.attributes?.href) Linking.openURL(node.attributes.href)
        }}
      >
        {children}
      </Text>
    ),
  }
}

function styles(theme: Theme): Record<string, TextStyle | ViewStyle> {
  return {
    body: { color: theme.colors.text, fontSize: 15, lineHeight: 22 },
    paragraph: { marginTop: 0, marginBottom: 8 },
    heading1: { fontSize: 22, fontWeight: "700" as const, marginBottom: 8, marginTop: 16, color: theme.colors.text },
    heading2: { fontSize: 19, fontWeight: "700" as const, marginBottom: 6, marginTop: 14, color: theme.colors.text },
    heading3: { fontSize: 17, fontWeight: "600" as const, marginBottom: 4, marginTop: 12, color: theme.colors.text },
    heading4: { fontSize: 15, fontWeight: "600" as const, marginBottom: 4, marginTop: 10, color: theme.colors.text },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.border,
      paddingLeft: 12,
      marginVertical: 6,
      opacity: 0.85,
    },
    list_item: { marginBottom: 4 },
    bullet_list: { marginBottom: 8 },
    ordered_list: { marginBottom: 8 },
    strong: { fontWeight: "600" as const },
    em: { fontStyle: "italic" as const },
    s: { textDecorationLine: "line-through" as const },
    hr: {
      backgroundColor: theme.colors.border,
      height: StyleSheet.hairlineWidth,
      marginVertical: 12,
    },
    table: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: 6,
      marginVertical: 6,
    },
    thead: { backgroundColor: theme.colors.surface },
    th: { padding: 8, fontWeight: "600" as const, color: theme.colors.text },
    td: { padding: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
    tr: { flexDirection: "row" as const },
  }
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ children }: Props) {
  const theme = useTheme()
  const mdRules = useMemo(() => rules(theme), [theme])
  const mdStyles = useMemo(() => styles(theme), [theme])

  return (
    <Markdown rules={mdRules} style={mdStyles}>
      {children}
    </Markdown>
  )
})
