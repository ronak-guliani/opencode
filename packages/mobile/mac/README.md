# OpenCode Menu Bar App

A minimal macOS menu bar application to manage your OpenCode server.

## Features

- **Status Indicator**: Red icon when server is stopped, green when running
- **Auto-Start**: Click the icon when server is stopped to start it automatically
- **Server URL**: Displays the full server URL with your local IP address (ready to paste into mobile app)
- **Live Logs**: View real-time server logs in the popover
- **Menu Bar Only**: No dock icon, stays in your menu bar

## Building

```bash
cd packages/mobile/mac
swift build -c release
```

## Running

```bash
swift run
```

Or build and run the release binary:

```bash
.build/release/OpenCodeMenuBar
```

## Creating an App Bundle

To create a proper macOS app bundle:

```bash
#!/bin/bash

# Build release binary
swift build -c release

# Create app bundle structure
mkdir -p OpenCodeServer.app/Contents/MacOS
mkdir -p OpenCodeServer.app/Contents/Resources

# Copy binary
cp .build/release/OpenCodeMenuBar OpenCodeServer.app/Contents/MacOS/

# Copy Info.plist
cp Info.plist OpenCodeServer.app/Contents/

# Make executable
chmod +x OpenCodeServer.app/Contents/MacOS/OpenCodeMenuBar

echo "App bundle created: OpenCodeServer.app"
```

Save this as `build-app.sh`, make it executable (`chmod +x build-app.sh`), and run it.

## Usage

1. Launch the app - it will appear in your menu bar with a red or green circle icon
2. **Red icon** = Server is stopped
   - Click to open popover
   - Click "Start Server" button
   - Icon turns green when server starts
3. **Green icon** = Server is running
   - Click to see server URL and logs
   - Copy the server URL to paste into mobile app settings
   - Click "Stop Server" to shut down

## Requirements

- macOS 13.0+
- OpenCode installed at `/usr/local/bin/opencode`
- Swift 5.9+

## Configuration

The app automatically:

- Starts server on port 4096
- Binds to 0.0.0.0 (accessible from network)
- Detects your local IP address
- Monitors server health every 2 seconds

## Notes

- The app checks if the server is already running before starting
- Logs are limited to the last 100 entries
- Server URL automatically updates with your current local IP
- Closing the popover doesn't stop the server
