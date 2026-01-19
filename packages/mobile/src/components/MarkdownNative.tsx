import React, { useMemo, useCallback } from 'react'
import { StyleSheet, UIManager, findNodeHandle, Platform, Text, View, ViewProps } from 'react-native'

interface MarkdownProps {
  children: string
  style?: any
  rules?: Record<string, any>
  onLinkPress?: (url: string) => void
  selectable?: boolean
  mergeStyle?: boolean
}

export default function MarkdownNative({
  children,
  style,
  rules,
  onLinkPress,
  selectable = true,
  mergeStyle = true
}: MarkdownProps) {
  const processedContent = useMemo(() => {
    let content = children as string
    if (rules && Object.keys(rules).length > 0) {
      content = applyCustomRules(content, rules)
    }
    return content
  }, [children, rules])

  return (
    <View style={style?.body}>
      <Text style={{ color: '#fff', fontSize: 14 }}>
        {processedContent}
      </Text>
    </View>
  )
}

function applyCustomRules(content: string, rules: Record<string, any>): string {
  let result = content
  Object.entries(rules).forEach(([type, rule]) => {
    if (type === 'fence' || type === 'code_block') {
      result = extractCodeBlocks(result, rule)
    }
  })
  return result
}

function extractCodeBlocks(content: string, rule: any): string {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
  return content.replace(codeBlockRegex, (match, lang, code) => {
    const placeholder = `__CODE_BLOCK_${Date.now()}__`
    rule.render({
      type: 'fence',
      key: placeholder,
      content: code.trim(),
      sourceInfo: lang || ''
    })
    return placeholder
  })
}
