package com.momentsforever.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class AppLinkRulesTest {
    private static final String BASE = "https://momentsforever.vercel.app";

    @Test
    public void opensTheSharedLinks() {
        assertEquals("/n/abc123", AppLinkRules.targetFor(BASE + "/n/abc123"));
        assertEquals("/n/abc123/nao-vinculada", AppLinkRules.targetFor(BASE + "/n/abc123/nao-vinculada"));
        assertEquals("/a/XyZ", AppLinkRules.targetFor(BASE + "/a/XyZ"));
        assertEquals("/perfil", AppLinkRules.targetFor(BASE + "/perfil"));
        assertEquals("/perfil/rio-2024/album/42", AppLinkRules.targetFor(BASE + "/perfil/rio-2024/album/42"));
    }

    @Test
    public void keepsTheQueryAndDropsTheFragment() {
        assertEquals("/n/abc?src=nfc", AppLinkRules.targetFor(BASE + "/n/abc?src=nfc#top"));
    }

    @Test
    public void leavesEverythingElseOnTheWeb() {
        assertNull(AppLinkRules.targetFor(BASE + "/"));
        assertNull(AppLinkRules.targetFor(BASE + "/login"));
        assertNull(AppLinkRules.targetFor(BASE + "/auth/callback?code=x"));
        assertNull(AppLinkRules.targetFor(BASE + "/admin/users"));
        assertNull(AppLinkRules.targetFor(BASE + "/api/me"));
        assertNull(AppLinkRules.targetFor(BASE + "/ativar"));
        assertNull(AppLinkRules.targetFor(BASE + "/perfil/rio-2024")); // only redirects to /perfil
        assertNull(AppLinkRules.targetFor(BASE + "/someone")); // profile pages stay in the browser on Android
        assertNull(AppLinkRules.targetFor(BASE + "/n")); // not /n/*
    }

    @Test
    public void rejectsOtherHostsSchemesAndCredentials() {
        assertNull(AppLinkRules.targetFor("http://momentsforever.vercel.app/n/abc"));
        assertNull(AppLinkRules.targetFor("https://evil.example/n/abc"));
        assertNull(AppLinkRules.targetFor("https://momentsforever.vercel.app.evil.example/n/abc"));
        assertNull(AppLinkRules.targetFor("https://user:pw@momentsforever.vercel.app/n/abc"));
        assertNull(AppLinkRules.targetFor("https://momentsforever.vercel.app:8443/n/abc"));
        assertNull(AppLinkRules.targetFor("com.momentsforever.app://auth/callback?code=x"));
        assertNull(AppLinkRules.targetFor("javascript:alert(1)"));
        assertNull(AppLinkRules.targetFor(null));
        assertNull(AppLinkRules.targetFor(""));
    }

    @Test
    public void rejectsTrickyPaths() {
        assertNull(AppLinkRules.targetFor(BASE + "/n/../admin"));
        assertNull(AppLinkRules.targetFor(BASE + "/n/%2e%2e/admin"));
        assertNull(AppLinkRules.targetFor(BASE + "/n//abc"));
        assertNull(AppLinkRules.targetFor(BASE + "/n/a%5Cb"));
        assertNull(AppLinkRules.targetFor(BASE + "/n/a%00b"));
        assertNull(AppLinkRules.targetFor(BASE + "/n/a b"));
    }

    @Test
    public void rejectsVeryLongLinks() {
        StringBuilder path = new StringBuilder("/n/");
        for (int i = 0; i < 2100; i++) path.append('a');
        assertNull(AppLinkRules.targetFor(BASE + path));
    }
}
