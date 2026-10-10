import AuthenticationServices
import Capacitor
import Foundation
import UIKit

/// Runs an OAuth login (Google / Facebook through Supabase) inside Apple's
/// ASWebAuthenticationSession sheet. The sheet closes by itself when the
/// provider redirects to the app's callback scheme, and the callback URL is
/// handed straight back to the caller through the completion handler. The scheme
/// is also declared in Info.plist (CFBundleURLTypes) as a safeguard; the app does
/// nothing with URLs that reach it that way (no JS URL-open listener), and the JS
/// side only accepts the callback this plugin returns.
@objc(MomentsNativeAuthPlugin)
public class MomentsNativeAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "MomentsNativeAuthPlugin"
    public let jsName = "MomentsNativeAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    /// Fixed on purpose: the page cannot choose which scheme the sheet waits for.
    /// Same value as the bundle id and lib/auth/native-oauth.ts.
    private static let callbackScheme = "com.momentsforever.app"

    /// Keeps the session alive while the sheet is on screen.
    private var session: ASWebAuthenticationSession?

    /// Bumped on every start. A session that was cancelled to make room for a new one
    /// still reports back later; without this check its late completion would clear
    /// `session` while the NEW sheet is open, releasing it (the sheet vanishes and the
    /// JS promise never settles).
    private var generation = 0

    @objc func start(_ call: CAPPluginCall) {
        guard
            let raw = call.getString("url"),
            let url = URL(string: raw),
            url.scheme?.lowercased() == "https",
            let host = url.host, !host.isEmpty
        else {
            call.reject("The login URL must be a valid https URL.", "INVALID_URL")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("The login could not start.", "FAILED")
                return
            }
            self.session?.cancel()
            self.generation += 1
            let generation = self.generation

            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: Self.callbackScheme
            ) { [weak self] callbackURL, error in
                DispatchQueue.main.async {
                    if let plugin = self, plugin.generation == generation {
                        plugin.session = nil
                    }
                    if let authError = error as? ASWebAuthenticationSessionError,
                       authError.code == .canceledLogin {
                        call.reject("Login cancelled.", "CANCELLED")
                        return
                    }
                    if let error = error {
                        call.reject(error.localizedDescription, "FAILED")
                        return
                    }
                    guard let callbackURL = callbackURL else {
                        call.reject("The login returned no URL.", "FAILED")
                        return
                    }
                    call.resolve(["url": callbackURL.absoluteString])
                }
            }
            session.presentationContextProvider = self
            // Private sheet: shares no cookies with Safari, so iOS does not show the
            // "Wants to Use <host> to Sign In" prompt. The person picks/types the account
            // each time; the app session itself is kept by Supabase.
            session.prefersEphemeralWebBrowserSession = true

            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("Could not open the login sheet.", "FAILED")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
