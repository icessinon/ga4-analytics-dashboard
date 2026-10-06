import type { NextConfig } from "next"

const nextConfig: NextConfig = {
    output: 'standalone',
    experimental: {
        cpus: 1,
        webpackMemoryOptimizations: true,
    },
    async redirects() {
        // 履歴は /history のタブに統合した。独立ページだった旧 URL は該当タブへ送る
        return [
            { source: '/funnel/history', destination: '/history?tab=funnel', permanent: false },
            { source: '/reports/history', destination: '/history?tab=reports', permanent: false },
        ]
    },
}

export default nextConfig
