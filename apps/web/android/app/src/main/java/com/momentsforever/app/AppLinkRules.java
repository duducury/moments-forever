package com.momentsforever.app;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.regex.Pattern;

/**
 * Which https links of the site the Android app may open (Android App Links), as plain Java so it runs
 * in JVM unit tests. Same rules as the iOS SceneDelegate / apps/web/src/lib/ios/universal-links.ts, but only
 * for the links that are always shared: an Android intent-filter cannot express the "everything except…"
 * rules iOS uses for /{slug}, so profile pages stay in the browser on Android.
 *
 * The patterns use the AASA wildcard syntax of OPEN_FIRST in universal-links.ts (a test in
 * apps/web keeps the two lists identical) and must also be declared in the activity's intent-filter in
 * AndroidManifest.xml. The system decides which links reach the app; this class re-checks every link
 * before the WebView loads it.
 */
final class AppLinkRules {
    static final String HOST = "momentsforever.vercel.app";

    /** BEGIN APP LINK PATTERNS (mirrors OPEN_FIRST in universal-links.ts) */
    static final String[] OPEN_PATTERNS = {
        "/n/*",
        "/a/*",
        "/perfil",
        "/perfil/*/album/*",
    };
    /** END APP LINK PATTERNS */

    private static final int MAX_LINK_LENGTH = 2048;
    private static final Pattern[] COMPILED = compile(OPEN_PATTERNS);

    private AppLinkRules() {}

    private static Pattern[] compile(String[] patterns) {
        Pattern[] out = new Pattern[patterns.length];
        for (int i = 0; i < patterns.length; i++) {
            StringBuilder regex = new StringBuilder("^");
            for (char c : patterns[i].toCharArray()) {
                if (c == '*') regex.append(".*");
                else if (c == '?') regex.append('.');
                else regex.append(Pattern.quote(String.valueOf(c)));
            }
            out[i] = Pattern.compile(regex.append('$').toString());
        }
        return out;
    }

    /**
     * Where to navigate inside the app ("/n/abc?x=1": path + query, never the host from the link), or
     * null when the link must not be opened.
     */
    static String targetFor(String raw) {
        if (raw == null || raw.isEmpty() || raw.length() > MAX_LINK_LENGTH) return null;
        URI uri;
        try {
            uri = new URI(raw);
        } catch (URISyntaxException e) {
            return null;
        }
        if (!"https".equalsIgnoreCase(uri.getScheme())) return null;
        if (uri.getHost() == null || !HOST.equalsIgnoreCase(uri.getHost())) return null;
        if (uri.getRawUserInfo() != null || uri.getPort() != -1) return null;

        String decoded = uri.getPath(); // percent-decoded
        String rawPath = uri.getRawPath();
        if (decoded == null || rawPath == null || decoded.isEmpty()) return null;
        for (int i = 0; i < decoded.length(); i++) {
            char c = decoded.charAt(i);
            if (c == '\\' || c < 0x20 || c == 0x7f) return null;
        }
        if (decoded.contains("//")) return null;
        for (String segment : decoded.split("/", -1)) {
            if (segment.equals("..")) return null;
        }
        boolean allowed = false;
        for (Pattern pattern : COMPILED) {
            if (pattern.matcher(decoded).matches()) {
                allowed = true;
                break;
            }
        }
        if (!allowed) return null;

        String query = uri.getRawQuery();
        return query == null ? rawPath : rawPath + "?" + query;
    }
}
