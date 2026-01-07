let KeyboardControllerModule: unknown = null
let importError: Error | null = null

try {
  KeyboardControllerModule = require("react-native-keyboard-controller")
} catch (e) {
  importError = e as Error
}

export function getKeyboardControllerStatus() {
  return {
    imported: KeyboardControllerModule !== null,
    error: importError?.message || null,
  }
}

export { KeyboardControllerModule }
