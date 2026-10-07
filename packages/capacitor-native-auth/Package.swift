// swift-tools-version: 5.9
import PackageDescription

// The product name is NOT free: @capacitor/cli writes
//   .product(name: <fixName(npm name)>, package: <same>)
// into apps/web/ios/App/CapApp-SPM/Package.swift, and fixName() turns
// "@moments-forever/capacitor-native-auth" into the string below.
let package = Package(
    name: "MomentsForeverCapacitorNativeAuth",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "MomentsForeverCapacitorNativeAuth",
            targets: ["MomentsNativeAuthPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "MomentsNativeAuthPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/MomentsNativeAuthPlugin")
    ]
)
