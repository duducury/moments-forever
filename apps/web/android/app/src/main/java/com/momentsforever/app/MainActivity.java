package com.momentsforever.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * Capacitor's activity plus Android App Links: when the system opens the app for a shared link
 * (https://momentsforever.vercel.app/n/…, /a/…, /perfil, /perfil/…/album/…), the WebView loads that
 * route of the site. Links are re-checked by AppLinkRules and are always loaded on the app's own
 * server origin, never on the host written in the link.
 *
 * The OAuth callback (com.momentsforever.app://auth/callback) also reaches this activity but is NOT
 * handled here: it is not https, so AppLinkRules rejects it, and the MomentsNativeAuth plugin consumes it.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        openAppLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openAppLink(intent);
    }

    private void openAppLink(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri data = intent.getData();
        if (data == null) return;
        String target = AppLinkRules.targetFor(data.toString());
        if (target == null) return;

        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) return;
        String origin = bridge.getServerUrl();
        if (origin == null || origin.isEmpty()) return;
        final String url = origin.replaceAll("/+$", "") + target;
        final WebView webView = bridge.getWebView();
        webView.post(() -> webView.loadUrl(url));
    }
}
