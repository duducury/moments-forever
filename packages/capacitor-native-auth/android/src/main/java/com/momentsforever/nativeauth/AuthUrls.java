package com.momentsforever.nativeauth;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/**
 * The two URL checks of the login, as plain Java (no Android classes) so they run in
 * JVM unit tests. They mirror the iOS plugin (MomentsNativeAuthPlugin.swift) and
 * apps/web/src/lib/auth/native-oauth.ts:
 *   - the page may only ask for an https login URL with a host;
 *   - the only callback accepted is exactly com.momentsforever.app://auth/callback.
 */
final class AuthUrls {
    /** Same as the bundle id, the iOS plugin and NATIVE_OAUTH_CALLBACK_SCHEME in the web code. */
    static final String CALLBACK_SCHEME = "com.momentsforever.app";

    private static final int MAX_URL_LENGTH = 4096;

    private AuthUrls() {}

    /** An https URL with a host and no user info (what Supabase's authorize URL is). */
    static boolean isValidAuthorizeUrl(String raw) {
        if (raw == null || raw.isEmpty() || raw.length() > MAX_URL_LENGTH) return false;
        try {
            URI uri = new URI(raw);
            return "https".equalsIgnoreCase(uri.getScheme())
                && uri.getHost() != null
                && !uri.getHost().isEmpty()
                && uri.getRawUserInfo() == null;
        } catch (URISyntaxException e) {
            return false;
        }
    }

    /**
     * True only for com.momentsforever.app://auth/callback[?query]: no user info, no port,
     * host "auth", path "/callback". The query (the code) is NOT inspected or stored here;
     * the page validates and uses it.
     */
    static boolean isAppCallback(String raw) {
        if (raw == null || raw.isEmpty() || raw.length() > MAX_URL_LENGTH) return false;
        try {
            URI uri = new URI(raw);
            String scheme = uri.getScheme();
            return scheme != null
                && CALLBACK_SCHEME.equals(scheme.toLowerCase(Locale.ROOT))
                && "auth".equals(uri.getHost())
                && "/callback".equals(uri.getPath())
                && uri.getRawUserInfo() == null
                && uri.getPort() == -1;
        } catch (URISyntaxException e) {
            return false;
        }
    }
}
