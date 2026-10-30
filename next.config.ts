import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.PANDABYTE_NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/account/orders/*/document": ["./public/fonts/noto-sans/*.ttf"],
    "/api/admin/orders/*/document": ["./public/fonts/noto-sans/*.ttf"],
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'" },
    ] }];
  },
  turbopack: {
    rules: {
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
