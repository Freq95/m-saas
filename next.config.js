const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  // Do not let the SW cache API calls — always hit the network for live data.
  // Static assets (JS/CSS/images) are still precached for fast repeat loads.
  runtimeCaching: [],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: '.next-build',
  async redirects() {
    return [
      {
        source: '/settings',
        destination: '/settings/services',
        permanent: false,
      },
    ];
  },
  // CORS policy: authenticated API routes are same-origin only.
  // Do not add Access-Control-Allow-Origin: * for authenticated endpoints.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
              // Keep remote email images blocked inside srcdoc iframes to avoid tracking pixels and phishing-style UI spoofing.
              "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com",
              "connect-src 'self' https://*.r2.cloudflarestorage.com",
              "frame-ancestors 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = withPWA(nextConfig);
