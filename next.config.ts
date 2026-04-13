import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // xlsx uses Node built-ins; exclude it from the server bundle
  serverExternalPackages: ['xlsx'],
  allowedDevOrigins: ['192.168.11.100'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
};

const config = withNextIntl(nextConfig);

// next-intl 3.x injects experimental.turbo which is invalid in Next.js 16+
// (turbo moved to the top level). Move it to avoid the warning.
if (config.experimental && 'turbo' in config.experimental) {
  const { turbo, ...rest } = config.experimental as { turbo: unknown } & typeof config.experimental;
  config.turbo = (config.turbo ?? turbo) as typeof config.turbo;
  config.experimental = rest;
}

export default config;
