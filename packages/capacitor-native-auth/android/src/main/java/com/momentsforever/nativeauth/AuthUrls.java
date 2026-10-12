package com.momentsforever.nativeauth;

import java.io.UnsupportedEncodingException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.util.Locale;
import java.util.regex.Pattern;

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

    /** A Supabase auth code today is a UUID; keep the check loose but bounded (same rule as native-oauth.ts). */
    private static final Pattern CODE_PATTERN = Pattern.compile("^[A-Za-z0-9._~-]{8,512}$");

    /** How long after tapping "Entrar com Google" a callback is still accepted without a live login call. */
    static final long LOGIN_WINDOW_MS = 15L * 60L * 1000L;

    /** True while a login started at `startedAtMs` may still be completed by a callback at `nowMs`. */
    static boolean isLoginFresh(long startedAtMs, long nowMs) {
        return startedAtMs > 0 && nowMs >= startedAtMs && nowMs - startedAtMs <= LOGIN_WINDOW_MS;
    }

    /** Value of one query parameter of the callback URL (percent-decoded), or null. */
    private static String queryParam(String callbackUrl, String name) {
        try {
            String query = new URI(callbackUrl).getRawQuery();
            if (query == null) return null;
            for (String pair : query.split("&")) {
                int eq = pair.indexOf('=');
                String key = URLDecoder.decode(eq < 0 ? pair : pair.substring(0, eq), "UTF-8");
                if (key.equals(name)) {
                    return eq < 0 ? "" : URLDecoder.decode(pair.substring(eq + 1), "UTF-8");
                }
            }
            return null;
        } catch (URISyntaxException | UnsupportedEncodingException | IllegalArgumentException e) {
            return null;
        }
    }

    /**
     * The OAuth code of a valid app callback, or null when the callback is not the exact expected URL, carries a
     * provider error (cancelled / denied) or has no well-formed code. The code is returned to the caller only to
     * be forwarded; it must never be logged.
     */
    static String extractCode(String callbackUrl) {
        if (!isAppCallback(callbackUrl)) return null;
        if (queryParam(callbackUrl, "error") != null || queryParam(callbackUrl, "error_description") != null) return null;
        String code = queryParam(callbackUrl, "code");
        return code != null && CODE_PATTERN.matcher(code).matches() ? code : null;
    }

    /** Only the destinations /auth/callback itself allows (src/app/auth/callback/route.ts); anything else is dropped. */
    static String sanitizeNext(String next) {
        return "/login".equals(next) || "/ativar".equals(next) ? next : null;
    }

    /** The EXISTING web route that exchanges the code for a session: /auth/callback?code=…[&next=…]. */
    static String webCallbackPath(String code, String next) {
        try {
            String path = "/auth/callback?code=" + URLEncoder.encode(code, "UTF-8");
            String safeNext = sanitizeNext(next);
            return safeNext == null ? path : path + "&next=" + URLEncoder.encode(safeNext, "UTF-8");
        } catch (UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }
}
