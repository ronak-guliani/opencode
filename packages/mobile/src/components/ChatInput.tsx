import React, { useRef } from "react"
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { BlurView } from "@react-native-community/blur"
import { useNewMessageAnimation } from "@/hooks/useNewMessageAnimation"

interface ChatInputProps {
  value: string
  onChangeText: (text: string) => void
  onSend: () => void
  onModelPress: () => void
  modelName: string
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({
  value,
  onChangeText,
  onSend,
  onModelPress,
  modelName,
  disabled = false,
  placeholder = "Send a message...",
}: ChatInputProps) {
  const insets = useSafeAreaInsets()
  const hasText = value.trim().length > 0
  const isSendEnabled = hasText && !disabled
  const inputRef = useRef<TextInput>(null)
  
  const { isMessageSendAnimating } = useNewMessageAnimation()

  const handleSend = () => {
    if (hasText) {
      isMessageSendAnimating.value = true
      inputRef.current?.clear()
      onChangeText("")
      onSend()
    }
  }

  const handleKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (event.nativeEvent.key === "Enter") {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.innerContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.blurContainer}>
          {Platform.OS === 'ios' && (
            // @ts-ignore
            <BlurView
              style={StyleSheet.absoluteFill}
              blurType="dark"
              blurAmount={20}
              reducedTransparencyFallbackColor="#000000"
            />
          )}
          <View style={[styles.inputWrapper, Platform.OS === 'android' && styles.inputWrapperAndroid]}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={value}
              onChangeText={onChangeText}
              onKeyPress={handleKeyPress}
              placeholder={placeholder}
              placeholderTextColor="#666"
              multiline
              maxLength={2000}
              editable={!disabled}
              textAlignVertical="top"
            />

            <View style={styles.bottomRow}>
              <View style={styles.leftActions}>
                <TouchableOpacity style={styles.attachButton} disabled={disabled}>
                  <Text style={styles.attachIcon}>📎</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.modelButton} onPress={onModelPress} disabled={disabled}>
                  <Text style={styles.modelStar}>✦</Text>
                  <Text style={styles.modelName} numberOfLines={1}>
                    {modelName}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.sendButton, isSendEnabled && styles.sendButtonActive]}
                onPress={handleSend}
                disabled={!isSendEnabled}
              >
                <Text style={[styles.sendIcon, isSendEnabled && styles.sendIconActive]}>↑</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "transparent",
  },
  innerContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  blurContainer: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: Platform.OS === 'android' ? "rgba(0, 0, 0, 0.8)" : "rgba(0, 0, 0, 0.3)",
  },
  inputWrapper: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    minHeight: 120,
    backgroundColor: "transparent",
  },
  inputWrapperAndroid: {
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 22,
    minHeight: 50,
    maxHeight: 100,
    paddingTop: 0,
    paddingBottom: 0,
    fontFamily: "IBMPlexMono-Regular",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  leftActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  attachButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  attachIcon: {
    fontSize: 18,
    color: "#888",
  },
  modelButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  modelStar: {
    fontSize: 14,
    color: "#888",
  },
  modelName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonActive: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  sendIcon: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666666",
  },
  sendIconActive: {
    color: "#FFFFFF",
  },
})
