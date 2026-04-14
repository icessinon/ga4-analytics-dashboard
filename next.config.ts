import type { NextConfig } from "next"

const nextConfig: NextConfig = {
    output: 'standalone',
    experimental: {
        cpus: 1,
        webpackMemoryOptimizations: true,
    },
}

export default nextConfig
