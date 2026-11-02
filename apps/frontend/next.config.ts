import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ['@event-sharing/contracts'],
};

export default nextConfig;
