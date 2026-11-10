import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // This app lives in a subfolder of a repo with another package-lock.json: pin the project root.
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  // Server-only packages that must not be bundled by Next.
  serverExternalPackages: ["pg-boss", "pino", "nodemailer"],
  async headers() {
    return [
      {
        // Dashboard and API: never embeddable in other sites.
        source: "/((?!widget\\.js|demo).*)",
        headers: [...securityHeaders, { key: "X-Frame-Options", value: "DENY" }],
      },
      {
        // The embeddable widget script is public and cacheable for a short time.
        source: "/widget.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
