#!/bin/bash
# Rebuild and run iOS app with new dependencies

set -e

echo "🔧 Rebuilding OpenCode Mobile with Phase 1 dependencies"
echo "========================================================"
echo ""

cd "$(dirname "$0")"

echo "1️⃣ Installing iOS pods (blur + keyboard-controller native modules)..."
cd ios
pod install --repo-update
cd ..

echo ""
echo "2️⃣ Cleaning build cache..."
rm -rf ios/build
rm -rf .expo

echo ""
echo "3️⃣ Starting development build..."
echo ""
echo "This will:"
echo "  - Compile native modules (@react-native-community/blur)"
echo "  - Link keyboard-controller native code"
echo "  - Start Metro bundler"
echo "  - Launch iOS simulator"
echo ""

npx expo run:ios

echo ""
echo "✅ App should now be running!"
echo ""
echo "Test Phase 1 features:"
echo "  1. Create new chat"
echo "  2. Send message → watch slide animation"
echo "  3. Check blur effect on input"
echo "  4. Pan down to dismiss keyboard"
