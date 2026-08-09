import type { Metadata, Viewport } from "next";

import { AuthProvider } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/theme-provider";
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

const themeBootScript = `
(() => {
  try {
    const key = ${JSON.stringify(THEME_STORAGE_KEY)};
    const stored = localStorage.getItem(key);
    const preference = stored === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = preference;
    document.documentElement.dataset.resolvedTheme = preference;
  } catch (_) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" data-theme="dark" data-resolved-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
