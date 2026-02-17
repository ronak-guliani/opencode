import { memo, useMemo } from "react"
import { Text, StyleSheet, Linking, type TextStyle, type ViewStyle } from "react-native"
import MarkdownBase from "react-native-markdown-display"
import { useTheme, type Theme } from "../../theme"
import { CodeBlock } from "./code-block"

type Props = {
  children: string
  variant?: "default" | "reasoning"
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
          if (!node.attributes?.href) return
          Linking.openURL(node.attributes.href).catch(() => {
            // ignore invalid URLs from model output
          })
        }}
      >
        {children}
      </Text>
    ),
  }
}

function stylesForVariant(theme: Theme, variant: "default" | "reasoning"): Record<string, TextStyle | ViewStyle> {
  const isReasoning = variant === "reasoning"
  const baseText: TextStyle = isReasoning
    ? { fontFamily: "Geist", fontStyle: "italic" }
    : { fontFamily: "Geist" }
  const bodySize = isReasoning ? 13 : 15
  const bodyLine = isReasoning ? 18 : 22
  const heading1Size = isReasoning ? 16 : 22
  const heading2Size = isReasoning ? 15 : 19
  const heading3Size = isReasoning ? 14 : 17
  const heading4Size = isReasoning ? 13 : 15

  return {
    body: { ...baseText, color: theme.colors.text, fontSize: bodySize, lineHeight: bodyLine },
    paragraph: { ...baseText, marginTop: 0, marginBottom: isReasoning ? 6 : 8 },
    heading1: { ...baseText, fontSize: heading1Size, fontWeight: "700" as const, marginBottom: 8, marginTop: 16, color: theme.colors.text },
    heading2: { ...baseText, fontSize: heading2Size, fontWeight: "700" as const, marginBottom: 6, marginTop: 14, color: theme.colors.text },
    heading3: { ...baseText, fontSize: heading3Size, fontWeight: "600" as const, marginBottom: 4, marginTop: 12, color: theme.colors.text },
    heading4: { ...baseText, fontSize: heading4Size, fontWeight: "600" as const, marginBottom: 4, marginTop: 10, color: theme.colors.text },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.border,
      paddingLeft: 12,
      marginVertical: 6,
      opacity: 0.85,
    },
    list_item: { ...baseText, marginBottom: 4 },
    bullet_list: { ...baseText, marginBottom: 8 },
    ordered_list: { ...baseText, marginBottom: 8 },
    strong: { ...baseText, fontWeight: "600" as const },
    em: { ...baseText, fontStyle: "italic" as const },
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
    th: { ...baseText, padding: 8, fontWeight: "600" as const, color: theme.colors.text },
    td: { ...baseText, padding: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
    tr: { flexDirection: "row" as const },
  }
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ children, variant = "default" }: Props) {
  const theme = useTheme()
  const mdRules = useMemo(() => rules(theme), [theme])
  const mdStyles = useMemo(() => stylesForVariant(theme, variant), [theme, variant])

  return (
    <Markdown rules={mdRules} style={mdStyles}>
      {children}
    </Markdown>
  )
})
