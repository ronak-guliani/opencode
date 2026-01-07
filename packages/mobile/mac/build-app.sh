#!/bin/bash

set -e

echo "🔨 Building OpenCode Menu Bar App..."

cd "$(dirname "$0")"

swift build -c release

echo "📦 Creating app bundle..."

APP_NAME="OpenCodeServer.app"
rm -rf "$APP_NAME"

mkdir -p "$APP_NAME/Contents/MacOS"
mkdir -p "$APP_NAME/Contents/Resources"

cp .build/release/OpenCodeMenuBar "$APP_NAME/Contents/MacOS/"
cp Info.plist "$APP_NAME/Contents/"

chmod +x "$APP_NAME/Contents/MacOS/OpenCodeMenuBar"

echo "✅ App bundle created: $APP_NAME"
echo ""
echo "To run:"
echo "  open $APP_NAME"
echo ""
echo "To install to Applications:"
echo "  cp -r $APP_NAME /Applications/"
