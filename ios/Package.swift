// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "MP2",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        // Un projet xtool contient une seule bibliothèque : l'app.
        .library(name: "MP2", targets: ["MP2"]),
    ],
    targets: [
        .target(name: "MP2", swiftSettings: [.swiftLanguageMode(.v5)]),
    ]
)
