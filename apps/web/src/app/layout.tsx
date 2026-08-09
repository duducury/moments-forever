import type { Metadata, Viewport } from "next";

import { AuthProvider } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { THEME_STORAGE_KEY } from "@/lib/theme/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: "Moments Forever",
  description: "Colecione momentos, não coisas.",
};

/** App chrome stays fixed like Instagram; photo zoom is handled in the lightbox. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
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
