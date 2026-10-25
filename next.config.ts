import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Safe hardening for a public site. There is deliberately no Content-Security-Policy: the 3D stage uses blob
  // workers and WebAssembly, and a policy tight enough to matter would need testing on a real GPU first.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The voice button uses the microphone, on this origin only. Nothing here needs the camera, location or payments.
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), microphone=(self)" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        // Tailwind is for the app's global stylesheet. CSS Modules (*.module.css) must keep Next's own
        // handling, or their class names are never exported and the component loses its styles.
        condition: { not: { path: /\.module\.css$/ } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
