# OpenCode Mobile

React Native mobile app for OpenCode, built with Expo.

## Architecture

This mobile app acts as a **remote desktop client** for your local OpenCode server:

- Connect to OpenCode server running on `localhost:4096`
- Manage sessions and send messages
- Real-time message streaming via Server-Sent Events (SSE)
- GitHub OAuth authentication
- Secure API key storage

## Features

### Phase 1 (Current)

- ✅ Expo project setup with TypeScript
- ✅ File-based routing (Expo Router)
- ✅ GitHub OAuth authentication
- ✅ OpenCode API client with SSE support
- ✅ Session management
- ✅ Chat interface with terminal styling
- ✅ Settings screen for server config and API keys
- ✅ Monorepo integration

### Future (Phase 2+)

- GitHub Workspace abstraction for mobile-first operation
- Local session persistence
- Push notifications for session events
- File browser and editor
- Enhanced terminal features

## Project Structure

```
packages/mobile/
├── app/                    # Expo Router file-based routing
│   ├── _layout.tsx        # Root layout with auth routing
│   ├── index.tsx          # Auth redirect handler
│   ├── (auth)/            # Auth stack (GitHub OAuth)
│   │   ├── _layout.tsx
│   │   └── login.tsx
│   └── (app)/             # Main app (tabs)
│       ├── _layout.tsx    # Tabs: Sessions & Settings
│       ├── index.tsx      # Sessions list
│       ├── settings.tsx   # Server config & API keys
│       └── session/
│           └── [id].tsx   # Chat/terminal session
├── src/
│   ├── api/
│   │   └── client.ts      # OpenCode API client + SSE
│   ├── components/
│   │   └── Terminal.tsx   # Terminal UI components
│   └── store/
│       ├── auth.ts        # GitHub auth state
│       ├── server.ts      # Server connection config
│       └── session.ts     # Session and message state
├── app.json               # Expo configuration
├── package.json
└── tsconfig.json
```

## Installation

```bash
cd packages/mobile
bun install
```

## Development

### Authentication

The mobile app supports two authentication methods:

**Option 1: Personal Access Token (Recommended for Development)**

1. Generate a GitHub Personal Access Token at https://github.com/settings/tokens
2. Select scopes: `repo`, `user`, `read:user`
3. Open the app and tap "Or use Personal Access Token"
4. Paste your token and sign in

**Option 2: GitHub OAuth (For Production)**

1. Set `EXPO_PUBLIC_GITHUB_CLIENT_ID` in `.env` file
2. Create a GitHub OAuth app at https://github.com/settings/developers
3. Configure:
   - Homepage URL: `https://github.com`
   - Authorization callback URL: `exp://oauth` (development) or `opencode://oauth` (production)
4. Use "Sign in with GitHub" button

### OpenCode Server (Required)

The mobile app connects to an OpenCode server running on your computer. The server must be accessible from your mobile device.

**1. Start the server bound to all network interfaces:**

```bash
opencode serve --port 4096 --hostname 0.0.0.0
```

This outputs: `opencode server listening on http://0.0.0.0:4096`

**2. Find your computer's local IP address:**

```bash
# macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Example output:
# inet 192.168.1.174 netmask 0xffffff00 broadcast 192.168.1.255
```

**3. Configure the app:**

In the mobile app Settings tab, set the Server URL to your computer's IP:

```
http://192.168.1.174:4096
```

**Important Notes:**

- `localhost` and `127.0.0.1` will NOT work from a mobile device (those refer to the device itself)
- Both devices must be on the same network (WiFi)
- The `--hostname 0.0.0.0` flag is required to accept connections from other devices

### Run the App

```bash
# Start Expo dev server
bun run start

# Run on iOS simulator
bun run ios

# Run on Android emulator
bun run android

# Open in Expo Go
# Scan the QR code with Expo Go app
```

## Configuration

### Server Connection

Default: `http://localhost:4096`

Configure in **Settings** tab:

- **Server URL**: OpenCode server URL
- **Working Directory**: Optional project directory

### Provider Authentication

Configure API keys in **Settings** tab:

- **Provider ID**: e.g., `anthropic`, `openai`
- **API Key**: Your provider's API key

Keys are stored securely using `expo-secure-store` (mirroring OpenCode's Auth module behavior).

## Tech Stack

- **Expo 54**: Cross-platform React Native framework
- **Expo Router**: File-based routing
- **Zustand**: State management
- **TypeScript**: Type safety
- **expo-secure-store**: Secure storage for tokens/keys
- **expo-auth-session**: GitHub OAuth flow
- **react-native-sse**: SSE for React Native

## API Client

The `OpenCodeClient` class provides:

- `listSessions()`: Get all sessions
- `createSession()`: Create new session
- `getSession(id)`: Get session details
- `getMessages(sessionId)`: Fetch session messages
- `sendMessage(sessionId, input, model)`: Send message
- `subscribeToEvents(callback)`: SSE subscription
- `listProviders()`: Get available AI providers
- `setProviderAuth(providerId, auth)`: Save API keys
- `testConnection()`: Health check

## Known Issues

1. **React Version Mismatch**: TypeScript errors with `@expo/vector-icons` due to monorepo React version conflicts. These are type-only errors and won't affect runtime.

2. **GitHub OAuth**: Currently uses public OAuth flow. Production should implement secure token exchange via backend.

3. **Local Server Only**: Currently requires local OpenCode server. Future versions will support GitHub Workspace for mobile-first operation.

## Contributing

This app is part of the OpenCode monorepo. See the main [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## Architecture Notes

### Current: Remote Desktop Mode

The mobile app connects to a local OpenCode server running on the same network. All computation happens server-side.

### Future: GitHub Workspace Mode

The app will support direct GitHub integration for mobile-first coding:

- Direct GitHub API integration
- Code execution in GitHub Codespaces/Actions
- Local caching of workspace state
- Offline-first with sync

### File Markers

Files marked with `// TODO: Implement GitHub workspace abstraction` indicate where future GitHub workspace support needs integration.

## Troubleshooting

### "Cannot connect to server" / "Network request failed"

1. **Server must bind to all interfaces:**

   ```bash
   opencode serve --port 4096 --hostname 0.0.0.0
   ```

2. **Use your computer's actual IP address** (not `localhost` or `127.0.0.1`):

   ```bash
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```

3. **Ensure both devices are on the same WiFi network**

4. **Check firewall is not blocking port 4096**

5. **Verify server is running:**
   ```bash
   curl http://YOUR_IP:4096/global/health
   # Should return: {"healthy":true,"version":"..."}
   ```

### "GitHub OAuth failed"

1. Verify `EXPO_PUBLIC_GITHUB_CLIENT_ID` is set
2. Check redirect URI matches: `opencode://oauth/callback`
3. Ensure OAuth app has correct permissions

### "TypeScript errors"

React version conflicts from monorepo are expected. The app will run correctly despite TypeScript warnings about `@expo/vector-icons`.

## License

Same as OpenCode (see root LICENSE file).
