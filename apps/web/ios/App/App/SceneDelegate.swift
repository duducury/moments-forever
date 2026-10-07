import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // App launched (not just resumed) by a Universal Link.
        for activity in connectionOptions.userActivities {
            openUniversalLink(activity)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
        // App already running (foreground or background) when a Universal Link arrives.
        openUniversalLink(userActivity)
    }

    /// Loads an allowed Universal Link in the existing web view. No new screen:
    /// the site's own routing (public profile, album, /n/{token}, /a/{code}, /perfil)
    /// renders it. Anything that fails UniversalLinkRouter is ignored.
    private func openUniversalLink(_ activity: NSUserActivity) {
        guard
            activity.activityType == NSUserActivityTypeBrowsingWeb,
            let link = activity.webpageURL,
            let target = UniversalLinkRouter.target(for: link),
            let controller = window?.rootViewController as? CAPBridgeViewController
        else { return }

        controller.loadViewIfNeeded()
        guard let webView = controller.webView, let base = controller.bridge?.config.serverURL else { return }

        // Always the app's own origin (server.url), never the host of the link.
        guard var components = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return }
        components.percentEncodedPath = target.percentEncodedPath
        components.percentEncodedQuery = target.percentEncodedQuery
        guard let destination = components.url else { return }

        webView.load(URLRequest(url: destination))
    }
}

/// Decides which links the system hands to the app may be opened. Mirrors
/// apps/web/src/lib/ios/universal-links.ts (parseUniversalLink + the AASA
/// components); src/lib/ios/universal-links.test.ts fails if the two lists differ.
enum UniversalLinkRouter {
    static let host = "momentsforever.vercel.app"
    private static let maxLength = 2048

    // BEGIN AASA RULES
    // First matching rule wins. `*` = any characters, `?` = one character.
    static let rules: [(pattern: String, exclude: Bool)] = [
        ("/n/*", false),
        ("/a/*", false),
        ("/perfil", false),
        ("/perfil/*/album/*", false),
        ("/", true),
        ("/.well-known", true),
        ("/.well-known/*", true),
        ("/_next", true),
        ("/_next/*", true),
        ("/admin", true),
        ("/admin/*", true),
        ("/api", true),
        ("/api/*", true),
        ("/ativar", true),
        ("/ativar/*", true),
        ("/auth", true),
        ("/auth/*", true),
        ("/brand", true),
        ("/brand/*", true),
        ("/favicon.ico", true),
        ("/favicon.ico/*", true),
        ("/fonts", true),
        ("/fonts/*", true),
        ("/geo", true),
        ("/geo/*", true),
        ("/geral", true),
        ("/geral/*", true),
        ("/home", true),
        ("/home/*", true),
        ("/import", true),
        ("/import/*", true),
        ("/login", true),
        ("/login/*", true),
        ("/mapa", true),
        ("/mapa/*", true),
        ("/nome", true),
        ("/nome/*", true),
        ("/passaporte", true),
        ("/passaporte/*", true),
        ("/politica-de-privacidade", true),
        ("/politica-de-privacidade/*", true),
        ("/premium-frames", true),
        ("/premium-frames/*", true),
        ("/privacidade", true),
        ("/privacidade/*", true),
        ("/trip", true),
        ("/trip/*", true),
        ("/viagens", true),
        ("/viagens/*", true),
        ("/perfil/*", true),
        ("/*.*", true),
        ("/*", false),
        ("/*/mapa", false),
        ("/*/passaporte", false),
    ]
    // END AASA RULES

    struct Target {
        let percentEncodedPath: String
        let percentEncodedQuery: String?
    }

    /// The path and query to load inside the app, or nil when the link must be ignored.
    static func target(for url: URL) -> Target? {
        guard url.absoluteString.count <= maxLength else { return nil }
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        guard components.scheme?.lowercased() == "https" else { return nil }
        guard components.host?.lowercased() == host else { return nil }
        guard components.user == nil, components.password == nil, components.port == nil else { return nil }

        // `path` is percent-decoded: what the site's router will actually see.
        let path = components.path
        guard path.hasPrefix("/") else { return nil }
        guard !path.contains("//"), !path.contains("\\") else { return nil }
        guard !path.unicodeScalars.contains(where: { $0.value < 0x20 || $0.value == 0x7f }) else { return nil }
        guard !path.split(separator: "/", omittingEmptySubsequences: false).contains("..") else { return nil }
        guard isAllowed(path) else { return nil }

        return Target(percentEncodedPath: components.percentEncodedPath, percentEncodedQuery: components.percentEncodedQuery)
    }

    static func isAllowed(_ path: String) -> Bool {
        for rule in rules where matches(rule.pattern, path) {
            return !rule.exclude
        }
        return false
    }

    private static func matches(_ pattern: String, _ path: String) -> Bool {
        var source = "^"
        for character in pattern {
            switch character {
            case "*": source += ".*"
            case "?": source += "."
            default: source += NSRegularExpression.escapedPattern(for: String(character))
            }
        }
        source += "$"
        return path.range(of: source, options: .regularExpression) != nil
    }
}
