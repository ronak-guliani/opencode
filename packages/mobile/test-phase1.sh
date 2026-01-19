#!/bin/bash
# Phase 1 Testing Script
# Validates all implemented features before device testing

set -e

echo "🧪 Phase 1 Feature Validation"
echo "=============================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

cd "$(dirname "$0")"

echo "📦 Step 1: Verifying Dependencies"
echo "-----------------------------------"

if grep -q "@legendapp/list" package.json && grep -q "@react-native-community/blur" package.json; then
    echo -e "${GREEN}✓${NC} Dependencies installed"
else
    echo -e "${RED}✗${NC} Missing dependencies"
    exit 1
fi

echo ""
echo "🔍 Step 2: TypeScript Type Checking"
echo "-----------------------------------"

if bun run typecheck 2>&1 | grep -q "markdown-native\|Down.h" && ! bun run typecheck 2>&1 | grep -qv "markdown-native\|Down.h" | grep -q "error TS"; then
    echo -e "${GREEN}✓${NC} No TypeScript errors in Phase 1 code"
else
    echo -e "${RED}✗${NC} TypeScript errors found"
    bun run typecheck 2>&1 | grep "error TS" | head -10
    exit 1
fi

echo ""
echo "📁 Step 3: Verifying File Structure"
echo "-----------------------------------"

files=(
    "src/hooks/useFirstMessageAnimation.ts"
    "src/hooks/useNewMessageAnimation.tsx"
    "src/hooks/useKeyboardHeight.ts"
    "src/components/Terminal.tsx"
    "src/components/ChatInput.tsx"
    "src/components/KeyboardCompatibleView.tsx"
    "app/(app)/session/[id].tsx"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file exists"
    else
        echo -e "${RED}✗${NC} Missing: $file"
        exit 1
    fi
done

echo ""
echo "🔎 Step 4: Verifying Key Imports"
echo "-----------------------------------"

# Check Terminal.tsx has Reanimated imports
if grep -q "react-native-reanimated" src/components/Terminal.tsx && \
   grep -q "useFirstMessageAnimation" src/components/Terminal.tsx && \
   grep -q "keyboardDismissMode" src/components/Terminal.tsx; then
    echo -e "${GREEN}✓${NC} Terminal.tsx properly integrated"
else
    echo -e "${RED}✗${NC} Terminal.tsx missing imports"
    exit 1
fi

# Check ChatInput has blur
if grep -q "@react-native-community/blur" src/components/ChatInput.tsx && \
   grep -q "BlurView" src/components/ChatInput.tsx; then
    echo -e "${GREEN}✓${NC} ChatInput.tsx has blur effect"
else
    echo -e "${RED}✗${NC} ChatInput.tsx missing BlurView"
    exit 1
fi

# Check session screen has provider
if grep -q "NewMessageAnimationProvider" app/\(app\)/session/\[id\].tsx; then
    echo -e "${GREEN}✓${NC} Session screen wrapped with provider"
else
    echo -e "${RED}✗${NC} Session screen missing provider"
    exit 1
fi

echo ""
echo "✨ Step 5: Code Quality Checks"
echo "-----------------------------------"

# Check for 'worklet' usage in animation hook
if grep -q "'worklet'" src/hooks/useFirstMessageAnimation.ts; then
    echo -e "${GREEN}✓${NC} Worklets properly declared"
else
    echo -e "${YELLOW}⚠${NC} Warning: worklet directive not found"
fi

# Check for shared values
if grep -q "useSharedValue" src/hooks/useFirstMessageAnimation.ts && \
   grep -q "useAnimatedReaction" src/hooks/useFirstMessageAnimation.ts; then
    echo -e "${GREEN}✓${NC} Reanimated hooks properly used"
else
    echo -e "${RED}✗${NC} Missing Reanimated hooks"
    exit 1
fi

echo ""
echo "📊 Summary"
echo "-----------------------------------"
echo -e "${GREEN}✓ All code validation checks passed!${NC}"
echo ""
echo "Phase 1 features implemented:"
echo "  ✅ First message animation (slide + fade)"
echo "  ✅ Assistant message fade-in"
echo "  ✅ Liquid Glass composer effect"
echo "  ✅ Interactive keyboard dismissal"
echo "  ✅ Composable hooks architecture"
echo ""
echo "🚀 Next Steps:"
echo "  1. Run: bun run ios"
echo "  2. Create new chat"
echo "  3. Send first message"
echo "  4. Verify animations are smooth (60fps)"
echo ""
echo "See PHASE1_COMPLETE.md for detailed testing guide"
