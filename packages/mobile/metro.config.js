const { getDefaultConfig } = require("expo/metro-config")
const path = require("path")

const root = path.resolve(__dirname, "../..")
const config = getDefaultConfig(__dirname)

// Monorepo: watch all workspace packages
config.watchFolders = [root]

// Resolve packages from both mobile/node_modules and root/node_modules
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules"), path.resolve(root, "node_modules")]

// Enable package.json exports field (for workspace: packages like @opencode-ai/sdk)
config.resolver.unstable_enablePackageExports = true

// Allow .js imports to resolve to .ts source files (SDK uses ESM .js extensions)
config.resolver.sourceExts = [...(config.resolver.sourceExts || []), "mjs", "cjs"]
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Handle .js -> .ts resolution for workspace packages
  if (moduleName.endsWith(".js") && !moduleName.includes("node_modules")) {
    const tsName = moduleName.replace(/\.js$/, ".ts")
    try {
      return context.resolveRequest(context, tsName, platform)
    } catch {
      // fall through to default resolution
    }
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
