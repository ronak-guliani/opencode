import React, { useState } from "react"
import { View, Text, TouchableOpacity, StyleSheet } from "react-native"
import * as Clipboard from "expo-clipboard"

interface ChatHeaderProps {
  onMenuPress: () => void
  onNewChatPress: () => void
  onCopyAll?: () => string
}

function CopyIcon({ color }: { color: string }) {
  return (
    <View style={iconStyles.container}>
      <View style={[iconStyles.backSquare, { borderColor: color }]} />
      <View style={[iconStyles.frontSquare, { borderColor: color }]} />
    </View>
  )
}

const iconStyles = StyleSheet.create({
  container: {
    width: 18,
    height: 18,
    position: "relative",
  },
  backSquare: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 12,
    height: 12,
    borderWidth: 1.5,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  frontSquare: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderWidth: 1.5,
    borderRadius: 2,
    backgroundColor: "#000000",
  },
})

export function ChatHeader({ onMenuPress, onNewChatPress, onCopyAll }: ChatHeaderProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!onCopyAll) return
    const content = onCopyAll()
    if (content) {
      await Clipboard.setStringAsync(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.iconButton} onPress={onMenuPress} activeOpacity={0.7}>
        <Text style={styles.menuIcon}>☰</Text>
      </TouchableOpacity>

      <View style={styles.rightButtons}>
        {onCopyAll && (
          <TouchableOpacity
            style={[styles.copyButton, copied && styles.copyButtonActive]}
            onPress={handleCopy}
            activeOpacity={0.7}
          >
            <CopyIcon color={copied ? "#3B82F6" : "rgba(255, 255, 255, 0.5)"} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.iconButton} onPress={onNewChatPress} activeOpacity={0.7}>
          <Text style={styles.newChatIcon}>✎</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#000000",
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  menuIcon: {
    fontSize: 24,
    color: "#FFFFFF",
  },
  newChatIcon: {
    fontSize: 22,
    color: "#FFFFFF",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  rightButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  copyButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  copyButtonActive: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
  },
})
