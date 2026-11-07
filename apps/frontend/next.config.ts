import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ['@event-sharing/contracts'],
  // The development server otherwise rejects its own public address.
  allowedDevOrigins: process.env.FRONTEND_ORIGIN
    ? [new URL(process.env.FRONTEND_ORIGIN).hostname]
    : [],
};

export default nextConfig;
