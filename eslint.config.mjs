// ESLint 9（flat config）。eslint-config-next 16 は flat config 前提なので .eslintrc.json から移行した。
// レイヤ境界（lib は UI を知らない / lib/bq は DB を触らない）を no-restricted-imports で固定する。
import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

const config = [
    ...coreWebVitals,
    ...typescript,
    {
        ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'node_modules/**', '.snapshots/**', 'scripts/tmp-*'],
    },
    {
        // 既存コードに多い書き方は warn に落とし、新規コードで増やさない目安にする（CI は error のみで落ちる）。
        // - no-explicit-any: GA4 / Prisma の JSON を any で受けている箇所が 70 超
        // - react-hooks/*: React Compiler 向けの新ルール（ref を render 中に読む、effect 内 setState、render 内のコンポーネント生成）
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            'react-hooks/refs': 'warn',
            'react-hooks/set-state-in-effect': 'warn',
            'react-hooks/static-components': 'warn',
        },
    },
    {
        // lib/**: サーバー・純粋ロジックの層。app / hooks / contexts / components（React・画面）を参照しない
        files: ['lib/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [
                    { group: ['@/app/*', '@/app/**'], message: 'lib から app を参照しない。型は lib/services/<domain>/*Types.ts に置く' },
                    { group: ['@/hooks/*', '@/hooks/**'], message: 'lib から hooks を参照しない' },
                    { group: ['@/contexts/*', '@/contexts/**'], message: 'lib から contexts を参照しない' },
                    { group: ['@/components/*', '@/components/**'], message: 'lib から components を参照しない' },
                ],
            }],
        },
    },
    {
        // lib/bq/**: BigQuery 層。Postgres（prisma）は lib/services/logging 経由で触る
        files: ['lib/bq/**/*.ts'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [
                    { group: ['@/lib/db/*', '@/lib/db/**'], message: 'lib/bq から DB を触らない。bqSyncedAt の更新は lib/services/logging/activityLogService.ts' },
                ],
            }],
        },
    },
]

export default config
