package com.momentsforever.nativeauth;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Runs an OAuth login (Google / Facebook through Supabase) in a Chrome Custom Tab and brings the result back to
 * the app. Android counterpart of the iOS plugin (ios/Sources/MomentsNativeAuthPlugin/MomentsNativeAuthPlugin.swift).
 *
 *   start({ url, next? })  ->  { url, handled? }
 *   rejects with code CANCELLED when the person comes back without finishing,
 *   INVALID_URL for a login URL that is not https, FAILED otherwise.
 *
 * Flow: the page asks Supabase for the authorize URL (PKCE: the code verifier stays in the WEB VIEW's cookies,
 * never here) -> this plugin opens it in a Custom Tab -> the provider redirects to
 * com.momentsforever.app://auth/callback?code=… -> Android hands that to MainActivity (intent-filter, singleTask)
 * -> {@link #handleOnNewIntent} forwards the code to the EXISTING web route /auth/callback by loading it in the
 * web view, where the server exchanges it with the verifier and writes the session cookies.
 *
 * Why the native side navigates instead of waiting for the page: while the Custom Tab (Chrome) is in front, a
 * low-memory phone may kill this app's process or the web view's renderer. The page that was waiting for the plugin
 * then no longer exists, so a callback that only resolved a JS promise would be dropped and the person would land
 * back on the login screen, logged out, again and again. A login that is "in progress" is therefore also recorded
 * in SharedPreferences (a timestamp and the allowlisted `next` path, never the code), so the callback is consumed
 * whether or not the page, the activity or the whole process survived. It is consumed ONCE: the record is removed
 * before the code is used, so a re-delivered intent cannot replay it.
 *
 * Security: callbacks are accepted only in the exact shape com.momentsforever.app://auth/callback, only while a login
 * is in progress (started in the last 15 minutes), and the code is never logged or stored. Another app that
 * registered the same scheme could see the code, but without the PKCE verifier (kept in the web view) it is useless.
 *
 * Custom Tabs give no "closed" event, so a return to the app without the callback is treated as a cancellation after
 * a short grace period (onNewIntent always runs before onResume).
 */
@CapacitorPlugin(name = "MomentsNativeAuth")
public class MomentsNativeAuthPlugin extends Plugin {
    private static final String TAG = "MomentsNativeAuth";
    private static final String PREFS = "moments_native_auth";
    private static final String KEY_STARTED_AT = "started_at";
    private static final String KEY_NEXT = "next";

    /**
     * How long after coming back to the app we wait for the callback before calling it a cancellation.
     * Some browsers hand the redirect to the app a moment AFTER the tab closed (onResume first), and slow
     * phones need longer, so this is generous; it only delays the message after a real cancellation.
     */
    private static final long CANCEL_GRACE_MS = 2000;

    private final Handler main = new Handler(Looper.getMainLooper());

    /** Callback id of the login call in progress in THIS process. Main thread only. */
    private String pendingCallId;
    /** True once the app went to the background (the tab is on screen). Main thread only. */
    private boolean leftApp;

    @PluginMethod
    public void start(PluginCall call) {
        String raw = call.getString("url");
        if (!AuthUrls.isValidAuthorizeUrl(raw)) {
            call.reject("The login URL must be a valid https URL.", "INVALID_URL");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("There is no screen to show the login.", "FAILED");
            return;
        }
        final String next = AuthUrls.sanitizeNext(call.getString("next"));
        // Keep the call alive until the callback (or a cancellation) settles it.
        call.setKeepAlive(true);
        getBridge().saveCall(call);
        activity.runOnUiThread(() -> begin(activity, call, raw, next));
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private void begin(Activity activity, PluginCall call, String raw, String next) {
        // An earlier login that never came back: settle its promise before starting a new one.
        settle(null, false, "CANCELLED", "Login cancelled.");
        pendingCallId = call.getCallbackId();
        leftApp = false;
        // The PKCE verifier was just written to the web view's cookies by the page. Cookies reach the disk lazily,
        // and this process may be killed while the browser is in front: persist them NOW.
        flushCookies();
        prefs().edit().putLong(KEY_STARTED_AT, System.currentTimeMillis()).putString(KEY_NEXT, next).commit();
        try {
            CustomTabsIntent tab = new CustomTabsIntent.Builder().setShowTitle(true).build();
            // Use a browser that really supports Custom Tabs (Chrome, Samsung Internet…) even when the phone's
            // default browser does not: a plain browser tab often refuses to hand the custom-scheme redirect
            // back to the app. null = none found, then the system chooses (still opens the login page).
            String provider = CustomTabsClient.getPackageName(activity, null);
            if (provider != null) tab.intent.setPackage(provider);
            Log.i(TAG, "opening the login in a Custom Tab, provider=" + (provider == null ? "system default" : provider));
            tab.launchUrl(activity, Uri.parse(raw));
        } catch (RuntimeException e) {
            Log.w(TAG, "could not open the login page: " + e.getClass().getSimpleName());
            prefs().edit().remove(KEY_STARTED_AT).remove(KEY_NEXT).commit();
            settle(null, false, "FAILED", "Could not open the login page.");
        }
    }

    private static void flushCookies() {
        try {
            CookieManager.getInstance().flush();
        } catch (RuntimeException e) {
            Log.w(TAG, "could not flush cookies: " + e.getClass().getSimpleName());
        }
    }

    /**
     * Resolves (url != null) or rejects the pending call of THIS process, if any, and forgets it.
     * `handled` tells the page the native side already opened /auth/callback, so it must not do it again
     * (the code can be exchanged only once). Main thread only.
     */
    private void settle(String url, boolean handled, String code, String message) {
        String id = pendingCallId;
        pendingCallId = null;
        leftApp = false;
        if (id == null) return;
        PluginCall saved = getBridge().getSavedCall(id);
        if (saved == null) return;
        if (url != null) {
            JSObject result = new JSObject();
            result.put("url", url);
            result.put("handled", handled);
            saved.resolve(result);
        } else {
            saved.reject(message, code);
        }
        getBridge().releaseCall(saved);
    }

    /** Loads a route of the site in the web view, on the app's own server origin. False when that is not possible. */
    private boolean openInWebView(String path) {
        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) return false;
        String origin = bridge.getServerUrl();
        if (origin == null || origin.isEmpty()) return false;
        final String url = origin.replaceAll("/+$", "") + path;
        final WebView webView = bridge.getWebView();
        webView.post(() -> webView.loadUrl(url));
        return true;
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null) return;
        Uri data = intent.getData();
        if (data == null) return;
        String url = data.toString();
        if (!AuthUrls.isAppCallback(url)) {
            // Never log the URL itself: it carries the one-time login code.
            if (AuthUrls.CALLBACK_SCHEME.equalsIgnoreCase(data.getScheme())) {
                Log.w(TAG, "ignored a link on the app scheme that is not the login callback");
            }
            return;
        }

        SharedPreferences prefs = prefs();
        long startedAt = prefs.getLong(KEY_STARTED_AT, 0);
        String next = prefs.getString(KEY_NEXT, null);
        boolean inProgress = AuthUrls.isLoginFresh(startedAt, System.currentTimeMillis());
        boolean hadPendingCall = pendingCallId != null;
        if (!inProgress && !hadPendingCall) {
            Log.w(TAG, "callback ignored: no login in progress (already used, expired or never started)");
            return;
        }
        // Single use: the record goes away BEFORE the code is used, so a re-delivered intent cannot replay it.
        prefs.edit().remove(KEY_STARTED_AT).remove(KEY_NEXT).commit();

        String code = AuthUrls.extractCode(url);
        boolean forwarded = false;
        if (code != null) {
            forwarded = openInWebView(AuthUrls.webCallbackPath(code, next));
        }
        Log.i(
            TAG,
            "login callback received: pendingCall=" + hadPendingCall + ", codePresent=" + (code != null) + ", forwardedToWebView=" + forwarded
        );
        // A provider error / cancellation (no code) is handed to the page, which shows the right message.
        settle(url, forwarded, null, null);
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (pendingCallId != null) leftApp = true;
        flushCookies();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        final String id = pendingCallId;
        if (id == null || !leftApp) return;
        // Back from the tab without a callback: the person closed it.
        main.postDelayed(
            () -> {
                if (id.equals(pendingCallId)) {
                    Log.i(TAG, "back in the app without a callback: treated as cancelled");
                    prefs().edit().remove(KEY_STARTED_AT).remove(KEY_NEXT).commit();
                    settle(null, false, "CANCELLED", "Login cancelled.");
                }
            },
            CANCEL_GRACE_MS
        );
    }
}
