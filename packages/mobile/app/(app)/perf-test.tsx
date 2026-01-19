import { useState, useCallback, useRef } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from "react-native"
import MarkdownDisplay from "react-native-markdown-display"

const SIMPLE_MD = `# Hello World\n\nThis is **bold** and *italic*.\n\n- Item 1\n- Item 2`

const MEDIUM_MD = `# React Native Guide

## Features
- **Cross-platform**: iOS and Android
- **Hot Reload**: See changes instantly

## Code Example
\`\`\`javascript
function App() {
  return <View><Text>Hello!</Text></View>;
}
\`\`\`

> React Native is awesome!
`

const COMPLEX_MD = `# Building Scalable Apps

## Architecture

| Aspect | Microservices | Monolith |
|--------|--------------|----------|
| Deploy | Independent | Single |
| Scale | Granular | Entire |

### Code Structure

\`\`\`typescript
interface User {
  id: string;
  email: string;
  profile: UserProfile;
}

class UserService {
  constructor(private repo: UserRepository) {}
  
  async create(data: CreateUserDTO): Promise<User> {
    const user = await this.repo.create(data);
    return user;
  }
}
\`\`\`

## Best Practices

1. **SOLID Principles**
   - Single Responsibility
   - Open/Closed
   - Liskov Substitution

2. **Error Handling**

\`\`\`typescript
class AppError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}
\`\`\`

### Database Tips
- Use **indexes** appropriately
- Implement **connection pooling**
- Consider **read replicas**

\`\`\`sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_orders_date ON orders(created_at DESC);
\`\`\`

## Testing

\`\`\`typescript
describe('UserService', () => {
  it('creates user', async () => {
    const result = await service.create(data);
    expect(result.id).toBeDefined();
  });
});
\`\`\`

## Deployment

\`\`\`yaml
name: Deploy
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
  deploy:
    needs: test
    steps:
      - run: kubectl apply -f k8s/
\`\`\`

---

*Building great software takes time and practice.*
`

const markdownStyles = StyleSheet.create({
  body: { color: "#ffffff", fontSize: 14, lineHeight: 20 },
  heading1: { color: "#ffffff", fontSize: 20, fontWeight: "700", marginVertical: 8 },
  heading2: { color: "#ffffff", fontSize: 16, fontWeight: "600", marginVertical: 6 },
  heading3: { color: "#ffffff", fontSize: 14, fontWeight: "600", marginVertical: 4 },
  code_inline: { backgroundColor: "#1A1A1A", color: "#E06C75", fontSize: 12, paddingHorizontal: 4 },
  fence: { backgroundColor: "#0D0D0D", padding: 8, marginVertical: 4, fontSize: 11, color: "#ABB2BF" },
  code_block: { backgroundColor: "#0D0D0D", padding: 8, fontSize: 11, color: "#ABB2BF" },
  blockquote: { backgroundColor: "#1A1A1A", borderLeftWidth: 3, borderLeftColor: "#3B82F6", paddingLeft: 8, marginVertical: 4 },
  table: { borderWidth: 1, borderColor: "#333", marginVertical: 4 },
  th: { padding: 4, backgroundColor: "#1A1A1A" },
  td: { padding: 4 },
  link: { color: "#3B82F6" },
  list_item: { marginVertical: 2 },
})

interface TestResult {
  name: string
  chars: number
  jsTime: number
  layoutTime: number
  totalTime: number
}

interface SingleTestProps {
  name: string
  content: string
  onResult: (result: TestResult) => void
  trigger: number
}

function SingleTest({ name, content, onResult, trigger }: SingleTestProps) {
  const startRef = useRef(0)
  const jsEndRef = useRef(0)
  const reportedRef = useRef(false)

  if (trigger > 0) {
    startRef.current = performance.now()
    reportedRef.current = false
  }

  const handleLayout = useCallback(() => {
    if (reportedRef.current || startRef.current === 0) return
    reportedRef.current = true
    
    const layoutEnd = performance.now()
    const jsTime = jsEndRef.current - startRef.current
    const layoutTime = layoutEnd - jsEndRef.current
    const totalTime = layoutEnd - startRef.current
    
    onResult({ name, chars: content.length, jsTime, layoutTime, totalTime })
  }, [name, content.length, onResult])

  if (trigger === 0) {
    return null
  }

  jsEndRef.current = performance.now()

  return (
    <View style={styles.testContainer} onLayout={handleLayout}>
      <MarkdownDisplay style={markdownStyles} mergeStyle>{content}</MarkdownDisplay>
    </View>
  )
}

export default function PerfTestScreen() {
  const [results, setResults] = useState<TestResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [trigger, setTrigger] = useState(0)
  const [currentTest, setCurrentTest] = useState(0)
  const pendingResults = useRef<TestResult[]>([])

  const tests = [
    { name: "Simple", content: SIMPLE_MD },
    { name: "Medium", content: MEDIUM_MD },
    { name: "Complex", content: COMPLEX_MD },
    { name: "Complex x2", content: COMPLEX_MD + "\n\n" + COMPLEX_MD },
    { name: "Complex x3", content: COMPLEX_MD + "\n\n" + COMPLEX_MD + "\n\n" + COMPLEX_MD },
  ]

  const handleResult = useCallback((result: TestResult) => {
    pendingResults.current.push(result)
    setResults([...pendingResults.current])
    
    if (pendingResults.current.length < tests.length) {
      setTimeout(() => {
        setCurrentTest(prev => prev + 1)
        setTrigger(prev => prev + 1)
      }, 300)
    } else {
      setIsRunning(false)
    }
  }, [tests.length])

  const runTests = useCallback(() => {
    setIsRunning(true)
    setResults([])
    pendingResults.current = []
    setCurrentTest(0)
    setTrigger(prev => prev + 1)
  }, [])

  const getColor = (ms: number) => {
    if (ms < 16.67) return "#22c55e"
    if (ms < 50) return "#eab308"
    if (ms < 100) return "#f97316"
    return "#ef4444"
  }

  const getFrames = (ms: number) => Math.floor(ms / 16.67)

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Markdown Perf Test</Text>
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitle}>
            react-native-markdown-display v7.0.2
          </Text>
        </View>
        <Text style={styles.target}>Target: {"<"}16.67ms (60fps)</Text>

        <TouchableOpacity
          style={[styles.button, isRunning && styles.buttonDisabled]}
          onPress={runTests}
          disabled={isRunning}
        >
          <Text style={styles.buttonText}>
            {isRunning ? `Testing ${tests[currentTest]?.name}...` : "Run Tests"}
          </Text>
        </TouchableOpacity>

        {results.length > 0 && (
          <View style={styles.resultsBox}>
            <View style={styles.headerRow}>
              <Text style={[styles.cell, styles.header, { flex: 1.5 }]}>Test</Text>
              <Text style={[styles.cell, styles.header]}>JS</Text>
              <Text style={[styles.cell, styles.header]}>Layout</Text>
              <Text style={[styles.cell, styles.header]}>Total</Text>
              <Text style={[styles.cell, styles.header, { flex: 0.6 }]}>Fr</Text>
            </View>
            {results.map((r, i) => (
              <View key={i} style={styles.row}>
                <Text style={[styles.cell, { flex: 1.5 }]}>{r.name}</Text>
                <Text style={styles.cell}>{r.jsTime.toFixed(1)}</Text>
                <Text style={styles.cell}>{r.layoutTime.toFixed(1)}</Text>
                <Text style={[styles.cell, { color: getColor(r.totalTime) }]}>
                  {r.totalTime.toFixed(1)}
                </Text>
                <Text style={[styles.cell, { flex: 0.6, color: getColor(r.totalTime) }]}>
                  {getFrames(r.totalTime) === 0 ? "✓" : `↓${getFrames(r.totalTime)}`}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.legend}>
          <Text style={styles.legendTitle}>Frame drops at 60fps:</Text>
          <Text style={[styles.legendItem, { color: "#22c55e" }]}>● {"<"}16.67ms = 0 drops</Text>
          <Text style={[styles.legendItem, { color: "#eab308" }]}>● 16.67-50ms = 1-2 drops</Text>
          <Text style={[styles.legendItem, { color: "#f97316" }]}>● 50-100ms = 3-5 drops</Text>
          <Text style={[styles.legendItem, { color: "#ef4444" }]}>● {">"}100ms = 6+ drops</Text>
        </View>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            T3 Chat reported ~185ms with Remark.{"\n"}
            Their native C parser: ~0.4ms.
          </Text>
        </View>

        {isRunning && tests[currentTest] && (
          <SingleTest
            name={tests[currentTest].name}
            content={tests[currentTest].content}
            onResult={handleResult}
            trigger={trigger}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

  const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  content: { padding: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", marginBottom: 4 },
  subtitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  subtitle: { fontSize: 13, color: "#888", marginBottom: 2 },
  switchRow: { flexDirection: "row", alignItems: "center", marginLeft: 8 },
  switchLabel: { fontSize: 13, color: "#fff", marginRight: 8 },
  target: { fontSize: 13, color: "#3B82F6", marginBottom: 16 },
  button: { backgroundColor: "#3B82F6", padding: 14, borderRadius: 8, alignItems: "center", marginBottom: 16 },
  buttonDisabled: { backgroundColor: "#1e40af", opacity: 0.7 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  resultsBox: { backgroundColor: "#111", borderRadius: 8, padding: 12, marginBottom: 16 },
  headerRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#333", paddingBottom: 6, marginBottom: 6 },
  row: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#222" },
  cell: { flex: 1, color: "#fff", fontSize: 12 },
  header: { color: "#888", fontWeight: "600" },
  legend: { backgroundColor: "#111", borderRadius: 8, padding: 12, marginBottom: 16 },
  legendTitle: { color: "#888", fontSize: 12, marginBottom: 6 },
  legendItem: { fontSize: 12, marginBottom: 2 },
  note: { backgroundColor: "#1A1A1A", borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: "#f97316" },
  noteText: { color: "#888", fontSize: 12, lineHeight: 18 },
  testContainer: { position: "absolute", left: -2000, top: 0, width: 375 },
})
