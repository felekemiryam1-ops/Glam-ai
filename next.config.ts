import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent the page from being embedded in an iframe (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  // Stop browsers from MIME-sniffing a response away from the declared content-type
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Only send the origin as the referrer (no full URL leakage)
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable browser features that Glam AI doesn't need
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // Force HTTPS for 1 year in production (ignored on http://localhost)
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // @tensorflow-models/face-landmarks-detection statically imports
  // @mediapipe/face_mesh (for its browser-only "mediapipe" runtime, which we
  // never use — we only use the "tfjs" runtime). That package is legacy
  // Closure-compiled JS with no real ESM exports, which fails Turbopack's
  // static bundling. Listing these here makes Next.js load them via Node's
  // require() at runtime instead of statically bundling/analyzing them.
  serverExternalPackages: [
    "@tensorflow-models/face-landmarks-detection",
    "@mediapipe/face_mesh",
    "@tensorflow/tfjs",
    "@tensorflow/tfjs-backend-cpu",
  ],
  async headers() {
    return [
      {
        // Apply to every route
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
