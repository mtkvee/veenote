import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://veenoteapp.vercel.app";

const dmSans = localFont({
  src: "./fonts/DMSans-Variable.ttf",
  variable: "--font-dm-sans",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "VeeNote",
    template: "%s | VeeNote",
  },
  description: "Mobile-first cloud synced notes with Google sign-in.",
  applicationName: "VeeNote",
  keywords: [
    "notes",
    "cloud notes",
    "google sign in",
    "mobile notes",
    "productivity",
  ],
  authors: [{ name: "VeeNote" }],
  creator: "VeeNote",
  publisher: "VeeNote",
  manifest: "/favicon/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon/favicon.ico" },
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      {
        url: "/favicon/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/favicon/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "VeeNote",
    description: "Mobile-first cloud synced notes with Google sign-in.",
    siteName: "VeeNote",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "VeeNote",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VeeNote",
    description: "Mobile-first cloud synced notes with Google sign-in.",
    images: ["/logo.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={dmSans.variable}>
        <script
          type="application/ld+json"
          // JSON-LD for SEO
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "VeeNote",
              applicationCategory: "ProductivityApplication",
              operatingSystem: "Web",
              description:
                "Mobile-first cloud synced notes with Google sign-in.",
              url: siteUrl,
            }),
          }}
        />
        {children}
      </body>
    </html>
  );
}
