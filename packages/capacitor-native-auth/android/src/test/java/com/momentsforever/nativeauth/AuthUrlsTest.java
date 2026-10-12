package com.momentsforever.nativeauth;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class AuthUrlsTest {
    @Test
    public void acceptsAnHttpsAuthorizeUrl() {
        assertTrue(AuthUrls.isValidAuthorizeUrl("https://abc.supabase.co/auth/v1/authorize?provider=google"));
    }

    @Test
    public void rejectsNonHttpsOrHostlessAuthorizeUrls() {
        assertFalse(AuthUrls.isValidAuthorizeUrl(null));
        assertFalse(AuthUrls.isValidAuthorizeUrl(""));
        assertFalse(AuthUrls.isValidAuthorizeUrl("http://abc.supabase.co/auth/v1/authorize"));
        assertFalse(AuthUrls.isValidAuthorizeUrl("javascript:alert(1)"));
        assertFalse(AuthUrls.isValidAuthorizeUrl("com.momentsforever.app://auth/callback"));
        assertFalse(AuthUrls.isValidAuthorizeUrl("https:///path"));
        assertFalse(AuthUrls.isValidAuthorizeUrl("https://user:pw@abc.supabase.co/auth"));
        assertFalse(AuthUrls.isValidAuthorizeUrl("https://abc.supabase.co/a b"));
    }

    @Test
    public void acceptsOnlyTheExactAppCallback() {
        assertTrue(AuthUrls.isAppCallback("com.momentsforever.app://auth/callback"));
        assertTrue(AuthUrls.isAppCallback("com.momentsforever.app://auth/callback?code=7b1f6c62-3a39"));
        assertTrue(AuthUrls.isAppCallback("COM.MOMENTSFOREVER.APP://auth/callback?code=x"));
    }

    @Test
    public void rejectsEveryOtherCallbackShape() {
        assertFalse(AuthUrls.isAppCallback(null));
        assertFalse(AuthUrls.isAppCallback("https://momentsforever.vercel.app/auth/callback"));
        assertFalse(AuthUrls.isAppCallback("com.momentsforever.app://auth/other"));
        assertFalse(AuthUrls.isAppCallback("com.momentsforever.app://evil/callback"));
        assertFalse(AuthUrls.isAppCallback("com.momentsforever.app://auth/callback/extra"));
        assertFalse(AuthUrls.isAppCallback("com.momentsforever.app://user@auth/callback"));
        assertFalse(AuthUrls.isAppCallback("com.momentsforever.app://auth:8080/callback"));
        assertFalse(AuthUrls.isAppCallback("com.momentsforever.other://auth/callback"));
        assertFalse(AuthUrls.isAppCallback("com.momentsforever.app://auth/callback with space"));
    }

    private static final String CODE = "7b1f6c62-3a39-4a2e-9d34-0c1f0e5d3b11";

    @Test
    public void extractsTheCodeOnlyFromAValidCallback() {
        assertEquals(CODE, AuthUrls.extractCode("com.momentsforever.app://auth/callback?code=" + CODE));
        assertEquals(CODE, AuthUrls.extractCode("com.momentsforever.app://auth/callback?state=x&code=" + CODE + "&other=1"));
    }

    @Test
    public void noCodeForProviderErrorsOrMalformedOrForeignUrls() {
        assertNull(AuthUrls.extractCode(null));
        assertNull(AuthUrls.extractCode("com.momentsforever.app://auth/callback"));
        assertNull(AuthUrls.extractCode("com.momentsforever.app://auth/callback?error=access_denied"));
        assertNull(AuthUrls.extractCode("com.momentsforever.app://auth/callback?code=" + CODE + "&error=server_error"));
        assertNull(AuthUrls.extractCode("com.momentsforever.app://auth/callback?code=short"));
        assertNull(AuthUrls.extractCode("com.momentsforever.app://auth/callback?code=has space"));
        assertNull(AuthUrls.extractCode("com.momentsforever.app://auth/callback?code=../../etc/passwd"));
        assertNull(AuthUrls.extractCode("https://momentsforever.vercel.app/auth/callback?code=" + CODE));
        assertNull(AuthUrls.extractCode("com.momentsforever.app://evil/callback?code=" + CODE));
    }

    @Test
    public void forwardsToTheExistingWebRouteWithAnAllowlistedNext() {
        assertEquals("/auth/callback?code=" + CODE, AuthUrls.webCallbackPath(CODE, null));
        assertEquals("/auth/callback?code=" + CODE + "&next=%2Fativar", AuthUrls.webCallbackPath(CODE, "/ativar"));
        assertEquals("/auth/callback?code=" + CODE + "&next=%2Flogin", AuthUrls.webCallbackPath(CODE, "/login"));
        assertEquals("/auth/callback?code=" + CODE, AuthUrls.webCallbackPath(CODE, "//evil.example"));
        assertEquals("/auth/callback?code=" + CODE, AuthUrls.webCallbackPath(CODE, "/admin"));
        assertNull(AuthUrls.sanitizeNext("https://evil.example"));
    }

    @Test
    public void aLoginIsFreshOnlyForAWhileAndNeverFromTheFuture() {
        long start = 1_000_000L;
        assertTrue(AuthUrls.isLoginFresh(start, start));
        assertTrue(AuthUrls.isLoginFresh(start, start + AuthUrls.LOGIN_WINDOW_MS));
        assertFalse(AuthUrls.isLoginFresh(start, start + AuthUrls.LOGIN_WINDOW_MS + 1));
        assertFalse("no login was started (already consumed or never begun)", AuthUrls.isLoginFresh(0, start));
        assertFalse("clock went backwards", AuthUrls.isLoginFresh(start, start - 1));
    }
}
