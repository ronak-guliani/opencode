import React from "react"
import { View, Text, StyleSheet } from "react-native"

interface WelcomeScreenProps {
  onSuggestionSelect: (suggestion: string) => void
}

export const WelcomeScreen = ({ onSuggestionSelect }: WelcomeScreenProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.greeting}>Hello there!</Text>
        <Text style={styles.subtitle}>How can I help you today?</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  greeting: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#888888",
    marginBottom: 40,
    textAlign: "center",
  },
})
