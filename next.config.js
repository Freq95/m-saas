/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: '.next-build',
  serverExternalPackages: ['@react-pdf/renderer'],
  // Bundle the treatment-plan PDF fonts into the serverless functions that
  // render PDFs (files under public/ are not traced into functions by default).
  outputFileTracingIncludes: {
    // Routes that render the treatment-plan PDF need the fonts bundled (files
    // under public/ aren't traced into functions by default). The PDF is built
    // lazily, so only these on-demand routes touch it.
    '/api/clients/[id]/treatment-plans/[planId]/pdf': ['./public/fonts/ptserif/**'],
    '/api/clients/[id]/treatment-plans/[planId]/send-email': ['./public/fonts/ptserif/**'],
    '/api/clients/[id]/treatment-plans/[planId]/share': ['./public/fonts/ptserif/**'],
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

module.exports = nextConfig;
