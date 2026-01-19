// @ts-ignore
import { requireNativeViewManager } from 'expo-modules-core'
import React from 'react'
import { StyleSheet } from 'react-native'
import type { MarkdownProps, MarkdownNativeViewProps } from './MarkdownNative.types'

const NativeView = requireNativeViewManager<MarkdownNativeViewProps>('MarkdownNative')

export default function MarkdownNative({
  children,
  style,
  rules,
  onLinkPress,
  selectable = true,
  mergeStyle = true
}: MarkdownProps) {
  const nativeStyle = React.useMemo(() => {
    if (!style) return undefined
    return Object.entries(style).reduce((acc, [key, value]) => {
      if (value && typeof value === 'object') {
        const flattened = StyleSheet.flatten(value)
        acc[key] = flattened
      }
      return acc
    }, {} as Record<string, any>)
  }, [style])

  const processedContent = React.useMemo(() => {
    let content = children as string

    if (rules && Object.keys(rules).length > 0) {
      content = applyCustomRules(content, rules)
    }

    return content
  }, [children, rules])

  const handleLinkPress = React.useCallback((event: any) => {
    const url = event.nativeEvent.url
    if (onLinkPress && url) {
      onLinkPress(url)
    }
  }, [onLinkPress])

  return (
    <NativeView
      style={nativeStyle}
      content={processedContent}
      selectable={selectable}
      onLinkPress={handleLinkPress}
    />
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
