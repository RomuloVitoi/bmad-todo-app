import type { NextConfig } from "next";

// `unsafe-inline` on script/style is a pragmatic default, not the gold
// standard: the App Router injects inline hydration/streaming scripts that a
// strict `script-src 'self'` would block without a per-request nonce wired
// through middleware. This CSP still blocks the common case (an attacker
// pulling in an external script/style from a third-party origin) and gives
// defense-in-depth against a future accidental `dangerouslySetInnerHTML`.
// Tighten to a nonce-based policy (Next's documented middleware pattern) if
// this app ever needs to resist inline-script injection specifically.
function buildCsp(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src 'self' ${apiUrl}`.trim(),
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const nextConfig: NextConfig = {
  // Standalone output emits a self-contained .next/standalone/server.js
  // with only the production node_modules needed at runtime. Required for
  // the multi-stage Docker pattern in apps/web/Dockerfile (Story 1.11).
  output: "standalone",

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: buildCsp() },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
