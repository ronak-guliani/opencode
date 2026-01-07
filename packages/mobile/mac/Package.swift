// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "OpenCodeMenuBar",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "OpenCodeMenuBar",
            targets: ["OpenCodeMenuBar"]
        )
    ],
    targets: [
        .executableTarget(
            name: "OpenCodeMenuBar",
            path: "Sources"
        )
    ]
)
