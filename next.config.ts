import type { NextConfig } from "next";

const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const authOrigin = authDomain ? `https://${authDomain}` : "";

const connectSrc = [
  "'self'",
  "https://*.googleapis.com",
  "https://www.googleapis.com",
  "https://apis.google.com",
  "https://oauth2.googleapis.com",
  "https://accounts.google.com",
  "https://securetoken.googleapis.com",
  "https://identitytoolkit.googleapis.com",
  "https://*.firebaseio.com",
  "wss://*.firebaseio.com",
  "https://*.web.app",
  authOrigin,
].filter(Boolean);

const frameSrc = [
  "'self'",
  "https://accounts.google.com",
  "https://*.web.app",
  authOrigin,
].filter(Boolean);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src ${connectSrc.join(" ")}`,
      `frame-src ${frameSrc.join(" ")}`,
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://accounts.google.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
