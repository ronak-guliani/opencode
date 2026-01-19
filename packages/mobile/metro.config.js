const { getDefaultConfig } = require("expo/metro-config")
const path = require("path")

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, "../..")

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules/.bun"),
]

config.resolver.unstable_enablePackageExports = true
config.resolver.unstable_enableSymlinks = true

config.resolver.extraNodeModules = {
  "markdown-native": path.resolve(projectRoot, "modules/markdown-native"),
  react: path.resolve(projectRoot, "node_modules/react"),
  "react-native": path.resolve(projectRoot, "node_modules/react-native"),
  "expo-modules-core": path.resolve(projectRoot, "node_modules/expo-modules-core"),
  "expo-router": path.resolve(projectRoot, "node_modules/expo-router"),
  expo: path.resolve(projectRoot, "node_modules/expo"),
}

module.exports = config
