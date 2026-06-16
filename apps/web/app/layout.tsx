import type { Metadata, Viewport } from "next";
import { EB_Garamond, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  variable: "--font-eb-garamond",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// `metadataBase` resolves relative URLs for OG / Twitter images. Production
// reads from NEXT_PUBLIC_SITE_URL when set; falls back to the live origin so
// Vercel preview deployments produce correct absolute image URLs without
// extra config.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://hyperpolymath.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default:
      "Hyperpolymath | A personal life-OS for people who refuse to specialize.",
    template: "%s · Hyperpolymath",
  },
  description:
    "I brought back the Renaissance Human, and gave them JARVIS from Tony Stark, all in one. A platform and a framework, fully open source. Use mine, or build your own.",
  applicationName: "Hyperpolymath",
  authors: [{ name: "Filippo Fonseca", url: "https://filippofonseca.com" }],
  creator: "Filippo Fonseca",
  publisher: "Filippo Fonseca",
  keywords: [
    "Hyperpolymath",
    "JARVIS",
    "life-OS",
    "productivity",
    "agent",
    "Claude",
    "Anthropic",
    "task manager",
    "second brain",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Hyperpolymath",
    title:
      "Hyperpolymath | A personal life-OS for people who refuse to specialize.",
    description:
      "I brought back the Renaissance Human, and gave them JARVIS from Tony Stark, all in one. A platform and a framework, fully open source. Use mine, or build your own.",
    // `opengraph-image.png` is auto-attached by Next.js file conventions.
  },
  twitter: {
    card: "summary_large_image",
    title:
      "Hyperpolymath | A personal life-OS for people who refuse to specialize.",
    description:
      "I brought back the Renaissance Human, and gave them JARVIS from Tony Stark, all in one. A platform and a framework, fully open source. Use mine, or build your own.",
    creator: "@filippofonseca",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  formatDetection: { telephone: false, email: false, address: false },
  // `icon.tsx` and `apple-icon.tsx` are auto-attached; no need to list them.
};

export const themeColor = [
  { media: "(prefers-color-scheme: light)", color: "#f6f3ec" },
  { media: "(prefers-color-scheme: dark)", color: "#0d0f12" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${ebGaramond.variable} ${jetbrainsMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
