package com.momentsforever.nativeauth;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Runs an OAuth login (Google / Facebook through Supabase) in a Chrome Custom Tab and hands the
 * callback URL back to the page. Android counterpart of the iOS plugin
 * (ios/Sources/MomentsNativeAuthPlugin/MomentsNativeAuthPlugin.swift); the JS contract is the same:
 *
 *   start({ url })  ->  { url: "com.momentsforever.app://auth/callback?code=…" }
 *   rejects with code CANCELLED when the person comes back without finishing,
 *   INVALID_URL for a login URL that is not https, FAILED otherwise.
 *
 * Flow: the page asks Supabase for the authorize URL (PKCE: the code verifier stays in the page's
 * cookies, never here) → this plugin opens it in a Custom Tab → the provider redirects to
 * com.momentsforever.app://auth/callback → Android hands that to MainActivity (an intent-filter in
 * the app manifest, launchMode singleTask) → handleOnNewIntent resolves the pending call with the URL
 * → the page validates it and opens the EXISTING /auth/callback?code=… route.
 *
 * Security: only ONE login is pending at a time; a callback is accepted only while one is pending
 * and only in the exact shape com.momentsforever.app://auth/callback (AuthUrls). The URL (and the
 * code in it) is passed straight to the page: it is not logged, not stored and not kept after the call
 * settles. Another app that registered the same scheme could see the code, but without the PKCE
 * verifier (kept in the page) the code is useless.
 *
 * Custom Tabs give no "closed" event, so a return to the app without the callback is treated as a
 * cancellation after a short grace period (onNewIntent always runs before onResume).
 */
@CapacitorPlugin(name = "MomentsNativeAuth")
public class MomentsNativeAuthPlugin extends Plugin {
    private static final String TAG = "MomentsNativeAuth";

    /**
     * How long after coming back to the app we wait for the callback before calling it a cancellation.
     * Some browsers hand the redirect to the app a moment AFTER the tab closed (onResume first), and slow
     * phones need longer, so this is generous; it only delays the message after a real cancellation.
     */
    private static final long CANCEL_GRACE_MS = 2000;

    private final Handler main = new Handler(Looper.getMainLooper());

    /** Callback id of the login in progress. Main thread only. */
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
        // Keep the call alive until the callback (or a cancellation) settles it.
        call.setKeepAlive(true);
        getBridge().saveCall(call);
        activity.runOnUiThread(() -> begin(activity, call, raw));
    }

    private void begin(Activity activity, PluginCall call, String raw) {
        // An earlier login that never came back: settle its promise before starting a new one.
        settle(null, "CANCELLED", "Login cancelled.");
        pendingCallId = call.getCallbackId();
        leftApp = false;
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
            settle(null, "FAILED", "Could not open the login page.");
        }
    }

    /** Resolves (url != null) or rejects the pending call, if any, and forgets it. Main thread only. */
    private void settle(String url, String code, String message) {
        String id = pendingCallId;
        pendingCallId = null;
        leftApp = false;
        if (id == null) return;
        PluginCall saved = getBridge().getSavedCall(id);
        if (saved == null) return;
        if (url != null) {
            JSObject result = new JSObject();
            result.put("url", url);
            saved.resolve(result);
        } else {
            saved.reject(message, code);
        }
        getBridge().releaseCall(saved);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (pendingCallId == null || intent == null) return;
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
        Log.i(TAG, "login callback received");
        settle(url, null, null);
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (pendingCallId != null) leftApp = true;
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
                    settle(null, "CANCELLED", "Login cancelled.");
                }
            },
            CANCEL_GRACE_MS
        );
    }
}
