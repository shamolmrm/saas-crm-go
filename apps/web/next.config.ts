import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Only allow image domains explicitly — no wildcards
  images: {
    domains: [],
  },
  // API URL is server-side only — never exposed to the browser bundle
  env: {
    API_URL: process.env.API_URL ?? 'http://localhost:4000',
  },
}

export default nextConfig
