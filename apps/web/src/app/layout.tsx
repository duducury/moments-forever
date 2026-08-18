import type { Metadata, Viewport } from "next";

import { AuthProvider } from "@/components/auth-provider";
import { PwaSplashDismiss } from "@/components/pwa-splash-dismiss";
import { RevealOnScroll } from "@/components/reveal-on-scroll";
import { ThemeProvider } from "@/components/theme-provider";
import { IOS_STARTUP_IMAGES } from "@/lib/pwa/ios-startup-images";
import { getSiteUrl } from "@/lib/site-url";
import { THEME_STORAGE_KEY } from "@/lib/theme/theme";

import "./globals.css";

const siteUrl = getSiteUrl();
const defaultDescription = "Colecione momentos, não coisas.";
const defaultOgImage = {
  url: "/brand/icon-512.png",
  width: 512,
  height: 512,
  alt: "Moments Forever",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Moments Forever",
    template: "%s · Moments Forever",
  },
  description: defaultDescription,
  applicationName: "Moments Forever",
  appleWebApp: {
    capable: true,
    title: "Moments Forever",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Moments Forever",
    title: "Moments Forever",
    description: defaultDescription,
    url: siteUrl,
    images: [defaultOgImage],
  },
  twitter: {
    card: "summary",
    title: "Moments Forever",
    description: defaultDescription,
    images: [defaultOgImage.url],
  },
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/brand/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  // iOS still honors this for standalone “Add to Home Screen” (no Safari chrome).
  other: {
    "apple-mobile-web-app-capable": "yes",
    "mobile-web-app-capable": "yes",
  },
};

/** App chrome stays fixed like Instagram; photo zoom is handled in the lightbox. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#121110",
};

const criticalBootCss = `
html,body{margin:0;min-height:100%;background:#121110;color:#f3efe8}
#pwa-boot-splash{position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:radial-gradient(90% 60% at 50% 18%,rgba(208,138,110,.18),transparent 58%),#121110;color:#f3efe8;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
#pwa-boot-splash img{width:88px;height:88px;border-radius:22px}
#pwa-boot-splash .mf-boot-title{margin:0;font-family:Georgia,"Times New Roman",serif;font-size:1.45rem;font-weight:500;letter-spacing:-0.03em}
#pwa-boot-splash .mf-boot-copy{margin:0;color:#a8a29a;font-size:15px;line-height:1.45}
#pwa-boot-splash .mf-boot-hint{margin:4px 0 0;color:#d08a6e;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
#pwa-boot-splash .mf-boot-pulse{width:10px;height:10px;border-radius:999px;background:#d08a6e;animation:mfBootPulse 1.6s ease-in-out infinite}
@keyframes mfBootPulse{0%,100%{opacity:.35;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}
@media (prefers-reduced-motion:reduce){#pwa-boot-splash .mf-boot-pulse{animation:none;opacity:.8}}
`;

const themeBootScript = `
(() => {
  try {
    const key = ${JSON.stringify(THEME_STORAGE_KEY)};
    const stored = localStorage.getItem(key);
    const preference = stored === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = preference;
    document.documentElement.dataset.resolvedTheme = preference;
    document.documentElement.style.backgroundColor = "#121110";
    document.documentElement.style.color = "#f3efe8";
  } catch (_) {
    document.documentElement.style.backgroundColor = "#121110";
    document.documentElement.style.color = "#f3efe8";
  }
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      data-theme="dark"
      data-resolved-theme="dark"
      style={{ backgroundColor: "#121110", color: "#f3efe8" }}
      suppressHydrationWarning
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: criticalBootCss }} />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {IOS_STARTUP_IMAGES.map((image) => (
          <link
            href={image.src}
            key={`${image.src}:${image.orientation}`}
            media={image.media}
            rel="apple-touch-startup-image"
          />
        ))}
      </head>
      <body style={{ backgroundColor: "#121110", color: "#f3efe8", margin: 0 }}>
        <div
          aria-label="Carregando Moments Forever"
          aria-live="polite"
          id="pwa-boot-splash"
          role="status"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" height={88} src="/brand/apple-touch-icon.png" width={88} />
          <p className="mf-boot-title">Moments Forever</p>
          <p className="mf-boot-copy">Colecione momentos, não coisas.</p>
          <p className="mf-boot-hint">Abrindo…</p>
          <span aria-hidden="true" className="mf-boot-pulse" />
        </div>
        <ThemeProvider>
          <AuthProvider>
            <RevealOnScroll />
            {children}
          </AuthProvider>
        </ThemeProvider>
        <PwaSplashDismiss />
      </body>
    </html>
  );
}
