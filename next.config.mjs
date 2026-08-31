/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [
      {
        // Deux manifestes (parent / enfant) : certains hébergeurs les servent
        // en `text/plain`, et le navigateur refuse alors l'installation.
        source: '/:file(.*\\.webmanifest)',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' }],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};
export default nextConfig;
