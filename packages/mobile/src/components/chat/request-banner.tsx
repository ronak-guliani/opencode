import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { View, Text, Pressable, StyleSheet, TextInput, Alert } from "react-native"
import * as Haptics from "expo-haptics"
import { useSessionPermissions, useSessionQuestions } from "../../api/hooks"
import { useRequests, type PendingQuestion } from "../../store/requests"
import { useTheme } from "../../theme"

type Props = {
  sessionId: string
}

export const RequestBanner = memo(function RequestBanner({ sessionId }: Props) {
  const theme = useTheme()
  const permissions = useSessionPermissions(sessionId)
  const questions = useSessionQuestions(sessionId)
  const replyPermission = useRequests((s) => s.replyPermission)
  const replyQuestion = useRequests((s) => s.replyQuestion)
  const rejectQuestion = useRequests((s) => s.rejectQuestion)

  const handlePermissionReply = useCallback(
    async (id: string, reply: "once" | "always" | "reject") => {
      try {
        void Haptics.selectionAsync()
        await replyPermission(id, reply)
      } catch {
        Alert.alert("Request failed", "Could not send permission response.")
      }
    },
    [replyPermission],
  )

  const handleRejectQuestion = useCallback(
    async (id: string) => {
      try {
        void Haptics.selectionAsync()
        await rejectQuestion(id)
      } catch {
        Alert.alert("Request failed", "Could not reject question.")
      }
    },
    [rejectQuestion],
  )

  const handleQuestionSubmit = useCallback(
    async (id: string, answers: string[][]) => {
      try {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        await replyQuestion(id, answers)
      } catch {
        Alert.alert("Request failed", "Could not submit answer.")
      }
    },
    [replyQuestion],
  )

  if (permissions.length === 0 && questions.length === 0) return null

  return (
    <View style={styles.container}>
      {permissions.map((permission) => (
        <View
          key={permission.id}
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.warning + "15",
              borderColor: theme.colors.warning + "50",
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.colors.text }]}>Permission Required</Text>
          <Text style={[styles.body, { color: theme.colors.textSecondary }]} numberOfLines={2}>
            {permission.title || permission.type}
          </Text>
          <View style={styles.actions}>
            <Action label="Allow once" onPress={() => handlePermissionReply(permission.id, "once")} themeColor={theme.colors.accent} />
            <Action label="Always allow" onPress={() => handlePermissionReply(permission.id, "always")} themeColor={theme.colors.success} />
            <Action label="Reject" onPress={() => handlePermissionReply(permission.id, "reject")} themeColor={theme.colors.error} />
          </View>
        </View>
      ))}

      {questions.map((question) => {
        return (
          <QuestionCard
            key={question.id}
            question={question}
            onReject={handleRejectQuestion}
            onSubmit={handleQuestionSubmit}
          />
        )
      })}
    </View>
  )
})

function QuestionCard({
  question,
  onReject,
  onSubmit,
}: {
  question: PendingQuestion
  onReject: (id: string) => void
  onSubmit: (id: string, answers: string[][]) => void
}) {
  const theme = useTheme()
  const [selected, setSelected] = useState<string[][]>([])
  const [custom, setCustom] = useState<string[]>([])

  useEffect(() => {
    setSelected(question.questions.map(() => []))
    setCustom(question.questions.map(() => ""))
  }, [question.id, question.questions])

  const selectOption = useCallback(
    (questionIndex: number, label: string, multiple: boolean) => {
      void Haptics.selectionAsync()
      setSelected((state) => {
        const next = state.map((answers) => [...answers])
        const current = next[questionIndex] ?? []
        if (multiple) {
          next[questionIndex] = current.includes(label) ? current.filter((item) => item !== label) : [...current, label]
        } else {
          next[questionIndex] = [label]
        }
        return next
      })
    },
    [],
  )

  const answers = useMemo(() => {
    return question.questions.map((info, index) => {
      const selectedAnswers = selected[index] ?? []
      if (selectedAnswers.length > 0) return selectedAnswers
      const customAnswer = (custom[index] ?? "").trim()
      if (customAnswer && info.custom !== false) return [customAnswer]
      return []
    })
  }, [question.questions, selected, custom])

  const canSubmit = answers.every((answer) => answer.length > 0)

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>
        {question.questions[0]?.header || "Question"}
      </Text>

      {question.questions.map((info, index) => (
        <View key={`${question.id}-${index}`} style={styles.questionBlock}>
          <Text style={[styles.body, { color: theme.colors.textSecondary }]}>{info.question}</Text>

          {info.options.length > 0 && (
            <View style={styles.optionWrap}>
              {info.options.map((option) => {
                const picked = (selected[index] ?? []).includes(option.label)
                return (
                  <Pressable
                    key={`${question.id}-${index}-${option.label}`}
                    style={[
                      styles.option,
                      {
                        borderColor: picked ? theme.colors.accent : theme.colors.border,
                        backgroundColor: picked ? theme.colors.accent + "20" : "transparent",
                      },
                    ]}
                    onPress={() => selectOption(index, option.label, !!info.multiple)}
                  >
                    <Text style={[styles.optionLabel, { color: picked ? theme.colors.accent : theme.colors.text }]}>
                      {option.label}
                    </Text>
                    {!!option.description && (
                      <Text style={[styles.optionDescription, { color: theme.colors.textTertiary }]}>
                        {option.description}
                      </Text>
                    )}
                  </Pressable>
                )
              })}
            </View>
          )}

          {info.custom !== false && (
            <TextInput
              style={[
                styles.customInput,
                {
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                  backgroundColor: theme.colors.background,
                },
              ]}
              value={custom[index] ?? ""}
              onChangeText={(value) => {
                setCustom((state) => {
                  const next = [...state]
                  next[index] = value
                  return next
                })
              }}
              placeholder="Type your answer"
              placeholderTextColor={theme.colors.textTertiary}
              multiline={!!info.multiple}
            />
          )}
        </View>
      ))}

      <View style={styles.actions}>
        <Action label="Reject" onPress={() => onReject(question.id)} themeColor={theme.colors.error} />
        <Pressable
          style={[
            styles.submit,
            {
              backgroundColor: canSubmit ? theme.colors.accent : theme.colors.surfaceRaised,
              opacity: canSubmit ? 1 : 0.6,
            },
          ]}
          onPress={() => onSubmit(question.id, answers)}
          disabled={!canSubmit}
        >
          <Text style={[styles.submitText, { color: theme.colors.accentText }]}>Submit</Text>
        </Pressable>
      </View>
    </View>
  )
}

function Action({
  label,
  onPress,
  themeColor,
}: {
  label: string
  onPress: () => void
  themeColor: string
}) {
  return (
    <Pressable style={[styles.action, { borderColor: themeColor + "70" }]} onPress={onPress}>
      <Text style={[styles.actionText, { color: themeColor }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  questionBlock: {
    gap: 8,
  },
  optionWrap: {
    gap: 8,
  },
  option: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  optionDescription: {
    fontSize: 11,
    lineHeight: 15,
  },
  customInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 40,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  action: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  submit: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  submitText: {
    fontSize: 12,
    fontWeight: "700",
  },
})
