# Native Markdown Migration Guide

## Executive Summary

Migrate from `react-native-markdown-display` (JS-based parser) to a native C/Swift/Kotlin solution to achieve **460x performance improvement** (from ~50-97ms to <0.5ms parsing time) and eliminate frame drops during markdown rendering.

**Current Performance:**
- Complex markdown (2000 chars): 28-50ms, drops 1-3 frames
- Complex x2 (4000 chars): 70-74ms, drops 4 frames  
- Complex x3 (6000 chars): 93-97ms, drops 5-6 frames

**Target Performance:**
- All markdown: <16.67ms total (0 frame drops at 60fps)
- Parsing: <0.5ms (native C parser)
- Layout: <10ms (native views)

**Inspiration:** T3 Chat achieved ~460x improvement by replacing Remark (JS) with native cmark (C).

---

## Current Architecture

### Tech Stack
- **Library:** `react-native-markdown-display` v7.0.2
- **Parser:** `markdown-it` (JavaScript)
- **Rendering:** React Native components via custom rules
- **Location:** `/src/components/Terminal.tsx`

### Component Structure
```typescript
MarkdownContent (memo)
  └─ MarkdownDisplay (react-native-markdown-display)
      ├─ Custom Rules (markdownRules)
      │   ├─ fence → CodeBlock component
      │   ├─ code_block → CodeBlock component  
      │   ├─ text → selectable Text
      │   ├─ textgroup → selectable Text
      │   ├─ strong → bold Text
      │   ├─ em → italic Text
      │   └─ paragraph → View + Text
      └─ Custom Styles (markdownStyles)
          ├─ Typography (IBMPlexMono-Regular)
          ├─ Colors (dark theme)
          └─ Spacing/Layout
```

### Features Used
- **Syntax Highlighting:** CodeBlock component with copy button
- **Selectability:** All text is selectable via custom rules
- **Styling:** Dark theme, custom colors, IBM Plex Mono font
- **Performance:** Memoized component, optimized FlatList rendering

### Current Dependencies
```json
{
  "react-native-markdown-display": "^7.0.2"
}
```

---

## Migration Options

### Option A: Use `@expensify/react-native-live-markdown`

**Pros:**
- Battle-tested (Expensify production app)
- Full native implementation (C++ parser)
- Expo-compatible
- Active maintenance

**Cons:**
- **BLOCKER:** Designed for `TextInput` (editable markdown), not read-only display
- Would require forking and significant modifications
- Not a drop-in replacement for our use case

**Verdict:** ❌ Not suitable for read-only markdown display

---

### Option B: Create Custom Expo Module (RECOMMENDED)

Build a custom native module that wraps:
- **iOS:** [Down](https://github.com/johnxnguyen/Down) (Swift wrapper for cmark)
- **Android:** [Markwon](https://noties.io/Markwon/) (native Kotlin/Java markdown)

**Pros:**
- ✅ Full control over API and features
- ✅ Optimized for our exact use case (read-only display)
- ✅ Native performance on both platforms
- ✅ Expo-compatible via Expo Modules API
- ✅ Can match existing component API for drop-in replacement

**Cons:**
- Requires native development (Swift, Kotlin)
- Initial setup complexity
- Maintenance burden

**Verdict:** ✅ Best option for long-term performance and control

---

### Option C: Use react-native-markdown-renderer + Optimize

Keep JS parsing but optimize rendering with:
- Web Workers for parsing
- Native driver animations
- Cached parsed results

**Pros:**
- Minimal code changes
- No native development required

**Cons:**
- Still limited by JS parsing overhead
- Won't achieve target <0.5ms parse time
- Web Workers add complexity

**Verdict:** ❌ Won't meet performance targets

---

## Recommended Approach: Option B

### Architecture Overview

```
React Native App
      ↓
MarkdownNativeModule (Expo Module - TypeScript)
      ↓
   ┌─────┴─────┐
   ↓           ↓
iOS Swift    Android Kotlin
   ↓           ↓
  Down       Markwon
   ↓           ↓
 cmark      commonmark-java
(C lib)        (Java)
```

### Component API (Drop-in Replacement)

```typescript
// BEFORE (react-native-markdown-display)
<MarkdownDisplay style={markdownStyles} rules={markdownRules}>
  {content}
</MarkdownDisplay>

// AFTER (our custom native module)
<MarkdownNative style={markdownStyles} rules={markdownRules}>
  {content}
</MarkdownNative>
```

---

## Implementation Plan

### Phase 1: Setup Expo Module (Week 1)

#### Step 1.1: Initialize Module
```bash
cd packages/mobile
npx create-expo-module@latest markdown-native

# Directory structure:
# modules/
#   markdown-native/
#     android/
#     ios/
#     src/
#     index.ts
#     expo-module.config.json
```

#### Step 1.2: Configure Package
```json
// modules/markdown-native/expo-module.config.json
{
  "platforms": ["ios", "android"],
  "ios": {
    "modules": ["MarkdownNativeModule"]
  },
  "android": {
    "modules": ["expo.modules.markdown.MarkdownNativeModule"]
  }
}
```

#### Step 1.3: Define TypeScript API
```typescript
// modules/markdown-native/src/MarkdownNative.types.ts
export interface MarkdownStyle {
  body?: TextStyle
  heading1?: TextStyle
  heading2?: TextStyle
  paragraph?: TextStyle
  strong?: TextStyle
  em?: TextStyle
  link?: TextStyle
  code_inline?: TextStyle
  code_block?: ViewStyle & TextStyle
  blockquote?: ViewStyle
  list_item?: TextStyle
  // ... all styles from current markdownStyles
}

export interface MarkdownRule {
  type: string
  render: (node: MarkdownNode) => React.ReactNode
}

export interface MarkdownProps {
  children: string
  style?: MarkdownStyle
  rules?: Record<string, MarkdownRule>
  onLinkPress?: (url: string) => void
  selectable?: boolean
}
```

---

### Phase 2: iOS Implementation (Week 2)

#### Step 2.1: Add Down Dependency
```ruby
# modules/markdown-native/ios/Podfile
Pod::Spec.new do |s|
  s.name           = 'MarkdownNative'
  s.version        = '1.0.0'
  s.summary        = 'Native markdown rendering for React Native'
  s.author         = 'OpenCode'
  s.homepage       = 'https://github.com/opencode'
  s.platform       = :ios, '13.0'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'Down', '~> 0.11.0'  # Swift wrapper for cmark

  s.source_files = "**/*.{h,m,swift}"
end
```

#### Step 2.2: Create Swift Module
```swift
// modules/markdown-native/ios/MarkdownNativeModule.swift
import ExpoModulesCore
import Down

public class MarkdownNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MarkdownNative")

    // Parse markdown to AST
    AsyncFunction("parse") { (markdown: String, promise: Promise) in
      do {
        let down = Down(markdownString: markdown)
        let ast = try down.toAST()
        promise.resolve(ast)
      } catch {
        promise.reject("PARSE_ERROR", error.localizedDescription)
      }
    }

    // Render markdown to attributed string
    AsyncFunction("render") { (markdown: String, options: [String: Any], promise: Promise) in
      do {
        let down = Down(markdownString: markdown)
        let styler = DownStyler(options: options)
        let attributedString = try down.toAttributedString(.default, styler: styler)
        
        // Convert to JSON representation for RN
        let result = attributedStringToJSON(attributedString)
        promise.resolve(result)
      } catch {
        promise.reject("RENDER_ERROR", error.localizedDescription)
      }
    }

    // View component
    View(MarkdownNativeView.self) {
      Prop("content") { (view, content: String) in
        view.setContent(content)
      }
      Prop("style") { (view, style: [String: Any]) in
        view.setStyle(style)
      }
    }
  }
}
```

#### Step 2.3: Create View Component
```swift
// modules/markdown-native/ios/MarkdownNativeView.swift
import ExpoModulesCore
import Down
import UIKit

class MarkdownNativeView: ExpoView {
  private let textView = UITextView()
  private var styleOptions: [String: Any] = [:]

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    setupTextView()
  }

  private func setupTextView() {
    textView.isEditable = false
    textView.isSelectable = true
    textView.backgroundColor = .clear
    textView.textContainerInset = .zero
    textView.textContainer.lineFragmentPadding = 0
    addSubview(textView)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    textView.frame = bounds
  }

  func setContent(_ markdown: String) {
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self = self else { return }
      
      do {
        let down = Down(markdownString: markdown)
        let styler = self.createStyler()
        let attributedString = try down.toAttributedString(.default, styler: styler)
        
        DispatchQueue.main.async {
          self.textView.attributedText = attributedString
        }
      } catch {
        print("Markdown rendering error: \(error)")
      }
    }
  }

  func setStyle(_ style: [String: Any]) {
    styleOptions = style
  }

  private func createStyler() -> DownStyler {
    // Convert RN style options to Down styler configuration
    var configuration = DownStylerConfiguration()
    
    if let bodyStyle = styleOptions["body"] as? [String: Any] {
      configuration.fonts.body = UIFont(name: "IBMPlexMono-Regular", size: 16) ?? .systemFont(ofSize: 16)
      if let color = bodyStyle["color"] as? String {
        configuration.colors.body = UIColor(hexString: color)
      }
    }
    
    if let h1Style = styleOptions["heading1"] as? [String: Any] {
      if let fontSize = h1Style["fontSize"] as? CGFloat {
        configuration.fonts.heading1 = .boldSystemFont(ofSize: fontSize)
      }
    }
    
    // ... map all other styles
    
    return DownStyler(configuration: configuration)
  }
}

// Helper extension for hex colors
extension UIColor {
  convenience init?(hexString: String) {
    let hex = hexString.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    var int: UInt64 = 0
    Scanner(string: hex).scanHexInt64(&int)
    let a, r, g, b: UInt64
    switch hex.count {
    case 6: (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
    case 8: (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
    default: return nil
    }
    self.init(red: CGFloat(r) / 255, green: CGFloat(g) / 255, blue: CGFloat(b) / 255, alpha: CGFloat(a) / 255)
  }
}
```

---

### Phase 3: Android Implementation (Week 3)

#### Step 3.1: Add Markwon Dependencies
```kotlin
// modules/markdown-native/android/build.gradle
dependencies {
  implementation 'io.noties.markwon:core:4.6.2'
  implementation 'io.noties.markwon:syntax-highlight:4.6.2'
  implementation 'io.noties.markwon:linkify:4.6.2'
  implementation 'io.noties.markwon:ext-tables:4.6.2'
}
```

#### Step 3.2: Create Kotlin Module
```kotlin
// modules/markdown-native/android/src/main/java/expo/modules/markdown/MarkdownNativeModule.kt
package expo.modules.markdown

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import io.noties.markwon.Markwon
import io.noties.markwon.SyntaxHighlight
import io.noties.markwon.ext.tables.TablePlugin

class MarkdownNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MarkdownNative")

    AsyncFunction("parse") { markdown: String ->
      try {
        // Return parsed markdown AST
        val parser = markwonInstance.markdownParser()
        val node = parser.parse(markdown)
        // Convert to JSON representation
        nodeToJSON(node)
      } catch (e: Exception) {
        throw Exception("PARSE_ERROR: ${e.message}")
      }
    }

    AsyncFunction("render") { markdown: String, options: Map<String, Any> ->
      try {
        val markwon = createMarkwonInstance(options)
        val parsed = markwon.toMarkdown(markdown)
        // Convert SpannableString to JSON for RN
        spannableToJSON(parsed)
      } catch (e: Exception) {
        throw Exception("RENDER_ERROR: ${e.message}")
      }
    }

    View(MarkdownNativeView::class) {
      Prop("content") { view: MarkdownNativeView, content: String ->
        view.setContent(content)
      }
      Prop("style") { view: MarkdownNativeView, style: Map<String, Any> ->
        view.setStyle(style)
      }
    }
  }

  private fun createMarkwonInstance(options: Map<String, Any>): Markwon {
    val context = appContext.reactContext ?: throw Exception("Context not available")
    
    return Markwon.builder(context)
      .usePlugin(SyntaxHighlight.create())
      .usePlugin(TablePlugin.create(context))
      .build()
  }
}
```

#### Step 3.3: Create View Component
```kotlin
// modules/markdown-native/android/src/main/java/expo/modules/markdown/MarkdownNativeView.kt
package expo.modules.markdown

import android.content.Context
import android.widget.TextView
import expo.modules.kotlin.views.ExpoView
import io.noties.markwon.Markwon
import io.noties.markwon.syntax.Prism4jThemeDarkula
import io.noties.markwon.syntax.SyntaxHighlightPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MarkdownNativeView(context: Context) : ExpoView(context) {
  private val textView = TextView(context)
  private var styleOptions: Map<String, Any> = emptyMap()
  private lateinit var markwon: Markwon

  init {
    setupTextView()
    setupMarkwon()
  }

  private fun setupTextView() {
    textView.setTextIsSelectable(true)
    textView.setBackgroundColor(android.graphics.Color.TRANSPARENT)
    addView(textView)
  }

  private fun setupMarkwon() {
    markwon = Markwon.builder(context)
      .usePlugin(SyntaxHighlightPlugin.create(Prism4jThemeDarkula.create()))
      .build()
  }

  fun setContent(markdown: String) {
    CoroutineScope(Dispatchers.Main).launch {
      val spanned = withContext(Dispatchers.Default) {
        markwon.toMarkdown(markdown)
      }
      textView.text = spanned
    }
  }

  fun setStyle(style: Map<String, Any>) {
    styleOptions = style
    applyStyles()
  }

  private fun applyStyles() {
    // Apply text color
    (styleOptions["body"] as? Map<*, *>)?.let { bodyStyle ->
      (bodyStyle["color"] as? String)?.let { color ->
        textView.setTextColor(android.graphics.Color.parseColor(color))
      }
      (bodyStyle["fontSize"] as? Number)?.let { fontSize ->
        textView.textSize = fontSize.toFloat()
      }
    }
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    super.onLayout(changed, l, t, r, b)
    textView.layout(0, 0, r - l, b - t)
  }
}
```

---

### Phase 4: React Native Bridge (Week 4)

#### Step 4.1: Create TypeScript Wrapper
```typescript
// modules/markdown-native/src/MarkdownNative.tsx
import { requireNativeViewManager } from 'expo-modules-core'
import * as React from 'react'
import { StyleSheet } from 'react-native'
import type { MarkdownProps } from './MarkdownNative.types'

const NativeView = requireNativeViewManager('MarkdownNative')

export default function MarkdownNative({ 
  children, 
  style, 
  rules,
  onLinkPress,
  selectable = true 
}: MarkdownProps) {
  // Convert style prop to format expected by native modules
  const nativeStyle = React.useMemo(() => {
    if (!style) return {}
    return Object.entries(style).reduce((acc, [key, value]) => {
      acc[key] = StyleSheet.flatten(value)
      return acc
    }, {} as Record<string, any>)
  }, [style])

  // Handle custom rules (if specified)
  const processedContent = React.useMemo(() => {
    if (!rules || Object.keys(rules).length === 0) {
      return children
    }
    // Custom rule processing logic here
    // For now, pass through unchanged
    return children
  }, [children, rules])

  return (
    <NativeView
      content={processedContent}
      style={nativeStyle}
      selectable={selectable}
      onLinkPress={onLinkPress}
    />
  )
}
```

#### Step 4.2: Export Module
```typescript
// modules/markdown-native/index.ts
export { default as MarkdownNative } from './src/MarkdownNative'
export type { MarkdownProps, MarkdownStyle } from './src/MarkdownNative.types'
```

#### Step 4.3: Configure Metro
```javascript
// packages/mobile/metro.config.js
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

// Add local module resolution
config.watchFolders = [
  path.resolve(__dirname, 'modules/markdown-native')
]

config.resolver.extraNodeModules = {
  'markdown-native': path.resolve(__dirname, 'modules/markdown-native')
}

module.exports = config
```

---

### Phase 5: Integration (Week 5)

#### Step 5.1: Install Module
```bash
cd packages/mobile
npm install ./modules/markdown-native
```

#### Step 5.2: Update Terminal.tsx
```typescript
// src/components/Terminal.tsx

// BEFORE
import MarkdownDisplay from "react-native-markdown-display"
const Markdown = MarkdownDisplay as any

const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  return (
    <Markdown style={markdownStyles} rules={markdownRules} mergeStyle>
      {content}
    </Markdown>
  )
})

// AFTER
import { MarkdownNative } from "markdown-native"

const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  return (
    <MarkdownNative style={markdownStyles} rules={markdownRules}>
      {content}
    </MarkdownNative>
  )
})
```

#### Step 5.3: Update CodeBlock Component
Since CodeBlock is a custom component, we need to ensure it works with the native renderer:

```typescript
// Option A: Keep CodeBlock as-is, handle in native renderer
// Configure native module to recognize code blocks and render them specially

// Option B: Extract CodeBlock rendering to a separate pass
const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  // Parse content for code blocks first
  const { markdown, codeBlocks } = extractCodeBlocks(content)
  
  return (
    <>
      <MarkdownNative style={markdownStyles}>
        {markdown}
      </MarkdownNative>
      {codeBlocks.map((block, i) => (
        <CodeBlock key={i} content={block.content} language={block.language} />
      ))}
    </>
  )
})
```

#### Step 5.4: Handle Custom Rules
For custom rules (fence, code_block, etc.), we have two options:

**Option A:** Implement in native code (recommended for performance)
```swift
// iOS: Extend DownStyler to handle code blocks
class CustomDownStyler: DownStyler {
  override func style(codeBlock node: Node) -> [NSAttributedString.Key: Any] {
    // Custom code block styling
    return [
      .backgroundColor: UIColor(hexString: "#0D0D0D"),
      .font: UIFont(name: "IBMPlexMono-Regular", size: 13)!,
      .foregroundColor: UIColor(hexString: "#ABB2BF")
    ]
  }
}
```

**Option B:** Pre-process markdown in JS (easier, slightly slower)
```typescript
function preprocessMarkdown(content: string): string {
  // Replace custom markdown patterns with native-friendly alternatives
  return content
    .replace(/```(\w+)\n([\s\S]*?)```/g, (match, lang, code) => {
      // Mark code blocks for special handling
      return `<code-block lang="${lang}">${code}</code-block>`
    })
}
```

---

### Phase 6: Performance Validation (Week 6)

#### Step 6.1: Update Performance Test
```typescript
// app/(app)/perf-test.tsx

import { MarkdownNative } from "markdown-native"

// Add comparison mode
const [useNative, setUseNative] = useState(true)

const MarkdownComponent = useNative ? MarkdownNative : MarkdownDisplay

// Run tests with both implementations
const results = {
  jsParser: runTests(MarkdownDisplay),
  nativeParser: runTests(MarkdownNative)
}
```

#### Step 6.2: Benchmark Targets
| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Parse time (2000 chars) | ~20ms | <0.5ms | ⏳ |
| Total render (2000 chars) | 28-50ms | <16.67ms | ⏳ |
| Frames dropped (2000 chars) | 1-3 | 0 | ⏳ |
| Parse time (6000 chars) | ~60ms | <1ms | ⏳ |
| Total render (6000 chars) | 93-97ms | <16.67ms | ⏳ |
| Frames dropped (6000 chars) | 5-6 | 0 | ⏳ |

#### Step 6.3: Validation Checklist
- [ ] Parse time <0.5ms for all test cases
- [ ] Total render time <16.67ms (60fps)
- [ ] Zero frames dropped on iPhone 17 Pro
- [ ] Zero frames dropped on lower-end devices (iPhone SE)
- [ ] All markdown features working (headings, lists, code, links)
- [ ] CodeBlock component rendering correctly
- [ ] Text selectability preserved
- [ ] Dark theme styling matches current design
- [ ] Custom rules (if any) working
- [ ] Memory usage comparable or better
- [ ] Bundle size increase <500KB

---

## API Compatibility Layer

To ensure drop-in replacement, maintain the same component API:

### Current API (react-native-markdown-display)
```typescript
interface MarkdownDisplayProps {
  children: string
  style?: StyleSheet
  rules?: Record<string, Function>
  mergeStyle?: boolean
  onLinkPress?: (url: string) => void
}
```

### New API (MarkdownNative)
```typescript
interface MarkdownNativeProps {
  children: string
  style?: MarkdownStyle  // Same structure
  rules?: Record<string, MarkdownRule>  // Compatible interface
  selectable?: boolean  // Default: true
  onLinkPress?: (url: string) => void  // Same callback
}
```

### Migration Helper
For gradual migration, create a compatibility wrapper:

```typescript
// src/components/MarkdownCompat.tsx
import { MarkdownNative } from "markdown-native"
import MarkdownDisplay from "react-native-markdown-display"

const USE_NATIVE = true // Feature flag

export const Markdown = USE_NATIVE ? MarkdownNative : MarkdownDisplay

// Usage in Terminal.tsx:
import { Markdown } from "@/components/MarkdownCompat"
```

---

## Testing Strategy

### Unit Tests
```typescript
// modules/markdown-native/__tests__/MarkdownNative.test.tsx
describe('MarkdownNative', () => {
  it('renders simple text', () => {
    const { getByText } = render(
      <MarkdownNative>Hello world</MarkdownNative>
    )
    expect(getByText('Hello world')).toBeTruthy()
  })

  it('renders headings', () => {
    const { getByText } = render(
      <MarkdownNative># Heading 1</MarkdownNative>
    )
    expect(getByText('Heading 1')).toBeTruthy()
  })

  it('renders code blocks', () => {
    const code = '```js\nconst x = 1\n```'
    const { getByText } = render(
      <MarkdownNative>{code}</MarkdownNative>
    )
    expect(getByText('const x = 1')).toBeTruthy()
  })

  it('handles empty content', () => {
    const { container } = render(
      <MarkdownNative></MarkdownNative>
    )
    expect(container).toBeTruthy()
  })
})
```

### Integration Tests
```typescript
// src/components/__tests__/Terminal.test.tsx
describe('Terminal with MarkdownNative', () => {
  it('renders messages with markdown', async () => {
    const messages = [
      { role: 'assistant', content: '# Hello\n\nThis is **bold**' }
    ]
    
    const { getByText } = render(
      <TerminalScreen sessionId="test" />
    )
    
    expect(getByText('Hello')).toBeTruthy()
    expect(getByText('This is bold')).toBeTruthy()
  })

  it('renders code blocks with copy button', () => {
    const message = {
      role: 'assistant',
      content: '```python\nprint("hello")\n```'
    }
    
    const { getByText } = render(<MessageBubble message={message} />)
    
    expect(getByText('python')).toBeTruthy()
    expect(getByText('Copy')).toBeTruthy()
  })
})
```

### Performance Tests
```typescript
// modules/markdown-native/__tests__/performance.test.ts
import { performance } from 'perf_hooks'

describe('MarkdownNative Performance', () => {
  it('parses complex markdown in <0.5ms', async () => {
    const complexMarkdown = generateComplexMarkdown(2000)
    
    const start = performance.now()
    await MarkdownNativeModule.parse(complexMarkdown)
    const end = performance.now()
    
    expect(end - start).toBeLessThan(0.5)
  })

  it('renders without dropping frames', async () => {
    const markdown = generateComplexMarkdown(6000)
    
    const frameDrops = await measureFrameDrops(() => {
      render(<MarkdownNative>{markdown}</MarkdownNative>)
    })
    
    expect(frameDrops).toBe(0)
  })
})
```

### Visual Regression Tests
```typescript
// Use Detox or Maestro for visual tests
describe('MarkdownNative Visual Tests', () => {
  it('matches snapshot for all markdown features', async () => {
    await device.launchApp()
    await element(by.id('perf-test-screen')).tap()
    
    // Take screenshot
    const screenshot = await device.takeScreenshot('markdown-render')
    
    // Compare with baseline
    expect(screenshot).toMatchImageSnapshot()
  })
})
```

---

## Rollout Plan

### Phase 1: Canary (Week 7)
- [ ] Deploy to internal testing channel
- [ ] Enable for 10% of beta users via feature flag
- [ ] Monitor crash reports and performance metrics
- [ ] Collect user feedback

### Phase 2: Beta (Week 8)
- [ ] Fix any issues from canary
- [ ] Enable for 50% of beta users
- [ ] A/B test performance metrics
- [ ] Validate all markdown features working

### Phase 3: Production (Week 9-10)
- [ ] Enable for 100% of users
- [ ] Remove old react-native-markdown-display dependency
- [ ] Remove feature flag code
- [ ] Update documentation

### Rollback Plan
- Keep feature flag for instant rollback
- Maintain old implementation for 2 releases
- Monitor error rates and performance

```typescript
// Feature flag implementation
import { FeatureFlags } from '@/config/features'

const USE_NATIVE_MARKDOWN = FeatureFlags.get('native-markdown', false)

export const Markdown = USE_NATIVE_MARKDOWN ? MarkdownNative : MarkdownDisplay
```

---

## Risk Mitigation

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Native crashes | HIGH | Extensive error handling, fallback to JS renderer |
| Platform inconsistencies | MEDIUM | Comprehensive visual tests, shared styling config |
| Custom rules incompatibility | MEDIUM | Pre-process markdown in JS if needed |
| Bundle size increase | LOW | Code splitting, lazy loading |
| Memory leaks | MEDIUM | Proper cleanup in native views, profiling |

### Example: Crash Recovery
```typescript
import { MarkdownNative, MarkdownDisplay } from '@/components/Markdown'
import { ErrorBoundary } from 'react-error-boundary'

function MarkdownWithFallback({ content }: { content: string }) {
  const [useFallback, setUseFallback] = useState(false)

  return (
    <ErrorBoundary
      fallbackRender={() => {
        setUseFallback(true)
        return <MarkdownDisplay>{content}</MarkdownDisplay>
      }}
      onError={(error) => {
        console.error('MarkdownNative crashed:', error)
        // Log to error tracking service
      }}
    >
      {useFallback ? (
        <MarkdownDisplay>{content}</MarkdownDisplay>
      ) : (
        <MarkdownNative>{content}</MarkdownNative>
      )}
    </ErrorBoundary>
  )
}
```

---

## Dependencies & Resources

### iOS Dependencies
- **Down:** https://github.com/johnxnguyen/Down (MIT License)
- **cmark:** https://github.com/commonmark/cmark (BSD License)
- CocoaPods for dependency management

### Android Dependencies
- **Markwon:** https://noties.io/Markwon/ (Apache 2.0)
- **commonmark-java:** https://github.com/commonmark/commonmark-java
- Gradle for dependency management

### Development Tools
- **Expo Modules API:** https://docs.expo.dev/modules/overview/
- **Expo Module Template:** `npx create-expo-module@latest`
- **Native Testing:** Detox, Maestro

### Reference Implementations
- **T3 Chat:** https://github.com/daangn/t3-chat (for inspiration)
- **Expensify Live Markdown:** https://github.com/Expensify/react-native-live-markdown
- **react-native-markdown-display:** https://github.com/iamacup/react-native-markdown-display

---

## Success Metrics

### Performance Metrics (Primary)
- ✅ Parse time: <0.5ms (target: 460x improvement)
- ✅ Total render time: <16.67ms (60fps)
- ✅ Frames dropped: 0 for all test cases
- ✅ Memory usage: ≤current implementation

### Quality Metrics (Secondary)
- ✅ Zero crashes in production (99.9% crash-free rate)
- ✅ Visual parity with current implementation
- ✅ All markdown features working
- ✅ Text selectability preserved

### User Experience Metrics
- ✅ Smooth scrolling (no jank)
- ✅ Instant rendering (no visible delay)
- ✅ No user-facing bugs or regressions

---

## Timeline Summary

| Week | Phase | Deliverable |
|------|-------|-------------|
| 1 | Setup | Expo module scaffold, TypeScript types |
| 2 | iOS | Swift implementation with Down |
| 3 | Android | Kotlin implementation with Markwon |
| 4 | Bridge | React Native wrapper, Metro config |
| 5 | Integration | Update Terminal.tsx, handle custom rules |
| 6 | Testing | Performance validation, unit/integration tests |
| 7 | Canary | Internal testing, 10% beta rollout |
| 8 | Beta | 50% rollout, A/B testing |
| 9-10 | Production | 100% rollout, cleanup |

**Total: 10 weeks from start to production**

---

## Next Steps

1. **Get stakeholder approval** for 10-week migration timeline
2. **Allocate resources** (1 iOS dev, 1 Android dev, 1 RN dev)
3. **Set up project** tracking (Jira, Linear, etc.)
4. **Create feature branch** `feature/native-markdown`
5. **Initialize Expo module** (Week 1, Day 1)
6. **Set up CI/CD** for native builds
7. **Create performance baseline** (run current perf tests, document results)

---

## Questions & Decisions Needed

- [ ] **Timeline approval:** Is 10 weeks acceptable, or do we need to accelerate?
- [ ] **Resource allocation:** Can we dedicate native developers full-time?
- [ ] **Feature flag strategy:** What percentage rollout for each phase?
- [ ] **Backwards compatibility:** Do we need to support old markdown renderer in parallel?
- [ ] **Bundle size limits:** What's acceptable bundle size increase?
- [ ] **Code block handling:** Implement in native or pre-process in JS?
- [ ] **Custom rules support:** Which rules need native implementation?

---

## Appendix A: Current Performance Data

### Test Results (iPhone 17 Pro Simulator)
```
Test 1: Simple markdown (~100 chars)
├─ Parse: 0ms
├─ Layout: 26-33ms
├─ Total: 26-33ms
└─ Frames dropped: 1-2

Test 2: Medium markdown (~500 chars)
├─ Parse: 0ms
├─ Layout: 20-24ms
├─ Total: 20-24ms
└─ Frames dropped: 1

Test 3: Complex markdown (~2000 chars)
├─ Parse: ~20ms (estimated)
├─ Layout: 8-30ms
├─ Total: 28-50ms
└─ Frames dropped: 1-3

Test 4: Complex x2 (~4000 chars)
├─ Parse: ~40ms (estimated)
├─ Layout: 30-34ms
├─ Total: 70-74ms
└─ Frames dropped: 4

Test 5: Complex x3 (~6000 chars)
├─ Parse: ~60ms (estimated)
├─ Layout: 33-37ms
├─ Total: 93-97ms
└─ Frames dropped: 5-6
```

### Bottleneck Analysis
1. **JS parsing overhead:** ~60-70% of time (markdown-it)
2. **Component creation:** ~20-25% of time (React Native)
3. **Layout/render:** ~10-15% of time (native side)

**Conclusion:** Native parser will eliminate #1, reducing total time by 60-70%.

---

## Appendix B: Markdown Feature Support Matrix

| Feature | Current | Down (iOS) | Markwon (Android) | Notes |
|---------|---------|------------|-------------------|-------|
| Headings (h1-h6) | ✅ | ✅ | ✅ | |
| Bold/Italic | ✅ | ✅ | ✅ | |
| Links | ✅ | ✅ | ✅ | |
| Code inline | ✅ | ✅ | ✅ | |
| Code blocks | ✅ | ✅ | ✅ | Custom component |
| Lists (ordered/unordered) | ✅ | ✅ | ✅ | |
| Blockquotes | ✅ | ✅ | ✅ | |
| Horizontal rules | ✅ | ✅ | ✅ | |
| Tables | ✅ | ✅ | ✅ | Requires plugin |
| Images | ✅ | ✅ | ✅ | |
| Strikethrough | ❌ | ⚠️ | ✅ | GFM extension |
| Task lists | ❌ | ⚠️ | ✅ | GFM extension |
| Syntax highlighting | ✅ | ⚠️ | ✅ | Custom implementation |
| Text selection | ✅ | ✅ | ✅ | |

**Legend:**
- ✅ Fully supported
- ⚠️ Requires extension/plugin
- ❌ Not supported

---

## Appendix C: Alternative Libraries Considered

### JavaScript Parsers (Rejected)
- **Marked:** Still JS, won't meet perf targets
- **Remark:** Slower than markdown-it (T3 Chat data)
- **unified:** Heavyweight, still JS

### Native Parsers
- **cmark (C):** ✅ Selected for iOS (via Down)
- **commonmark-java:** ✅ Selected for Android (via Markwon)
- **markdown-it (C++ port):** Not production-ready
- **libmd4c:** Fast, but less mature than cmark

### React Native Libraries
- **react-native-markdown-renderer:** Still uses JS parser
- **react-native-simple-markdown:** Limited features
- **@expensify/react-native-live-markdown:** ❌ For TextInput only

---

## Appendix D: Code Examples

### Example 1: Simple Migration
```typescript
// Before
import MarkdownDisplay from 'react-native-markdown-display'

<MarkdownDisplay style={styles}>{content}</MarkdownDisplay>

// After
import { MarkdownNative } from 'markdown-native'

<MarkdownNative style={styles}>{content}</MarkdownNative>
```

### Example 2: Custom Rules Migration
```typescript
// Before (JS-based custom rule)
const rules = {
  fence: (node) => <CodeBlock content={node.content} language={node.sourceInfo} />
}

<MarkdownDisplay rules={rules}>{content}</MarkdownDisplay>

// After (Option A: Native implementation)
// Implement custom rendering in Swift/Kotlin

// After (Option B: Pre-process in JS)
const processedContent = content.replace(/```(\w+)\n([\s\S]*?)```/g, 
  (match, lang, code) => `<code>${code}</code>`
)

<MarkdownNative>{processedContent}</MarkdownNative>
```

### Example 3: Error Handling
```typescript
import { MarkdownNative } from 'markdown-native'

function SafeMarkdown({ content }: { content: string }) {
  const [error, setError] = useState<Error | null>(null)

  if (error) {
    return <Text>Failed to render markdown: {error.message}</Text>
  }

  return (
    <ErrorBoundary
      onError={setError}
      fallback={<MarkdownDisplay>{content}</MarkdownDisplay>}
    >
      <MarkdownNative>{content}</MarkdownNative>
    </ErrorBoundary>
  )
}
```

---

## Contact & Support

**Project Lead:** [Your Name]  
**iOS Developer:** [TBD]  
**Android Developer:** [TBD]  
**RN Developer:** [TBD]

**Slack Channel:** #native-markdown-migration  
**Documentation:** [Link to internal docs]  
**Issue Tracker:** [Link to project board]

---

**Document Version:** 1.0  
**Last Updated:** 2026-01-07  
**Status:** Draft / Ready for Review
