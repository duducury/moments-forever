package com.momentsforever.nativeauth;

import static org.junit.Assert.assertFalse;
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
}
