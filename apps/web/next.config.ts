import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: { optimizePackageImports: ["@studentos/contracts"] },
  async redirects() {
    return [
      { source: "/sign-in", destination: "/onboarding", permanent: false },
      {
        source: "/auth/callback",
        destination: "/onboarding",
        permanent: false,
      },
      ...[
        "/today",
        "/plan/week",
        "/progress",
        "/skills",
        "/projects",
        "/placement",
        "/review",
        "/calendar",
        "/recalculate",
        "/notifications",
      ].map((source) => ({
        source,
        destination: "/roadmap",
        permanent: false,
      })),
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default config;
