/**
 * 統計的有意性計算サービス
 * 元のGASコードのcalculateStatisticalSignificance関数を参考に実装
 */

export interface StatisticalResult {
    significance: number;
    zScore: number;
    isSignificant: boolean;
}

/**
 * 統計的有意性を計算（Z検定）
 * 2つのバリアント間のCVRの差が統計的に有意かどうかをZ検定で判定
 * @param cv1 - バリアント1のコンバージョン数
 * @param pv1 - バリアント1のページビュー数
 * @param cv2 - バリアント2のコンバージョン数
 * @param pv2 - バリアント2のページビュー数
 * @returns 統計的有意性の結果（有意差、Zスコア、有意性判定）
 */
export function calculateStatisticalSignificance(
    cv1: number,
    pv1: number,
    cv2: number,
    pv2: number
): StatisticalResult {
    if (pv1 === 0 || pv2 === 0 || cv1 < 0 || cv2 < 0) {
        return { significance: 0, zScore: 0, isSignificant: false };
    }

    const p1 = cv1 / pv1;
    const p2 = cv2 / pv2;
    const pooledP = (cv1 + cv2) / (pv1 + pv2);
    const pooledSE = Math.sqrt(pooledP * (1 - pooledP) * (1 / pv1 + 1 / pv2));

    if (pooledSE === 0) {
        return { significance: 0, zScore: 0, isSignificant: false };
    }

    const zScore = (p1 - p2) / pooledSE;

    // CV > PV（CVR>100%）等でpooledSEがNaNになるとJSONでnullになり「null%」表示になるためガード
    if (!Number.isFinite(zScore)) {
        return { significance: 0, zScore: 0, isSignificant: false };
    }

    let significance = 0;
    const absZ = Math.abs(zScore);
    if (absZ >= 2.58) {
        significance = 99;
    } else if (absZ >= 1.96) {
        significance = 95;
    } else if (absZ >= 1.65) {
        significance = 90;
    } else {
        significance = Math.min(90, Math.round((1 - 2 * (1 - normalCDF(absZ))) * 100));
    }

    return {
        significance,
        zScore,
        isSignificant: significance >= 95,
    };
}

/**
 * 正規分布の累積分布関数
 * Zスコアから正規分布の累積確率を計算（Abramowitz and Stegun近似式を使用）
 * @param z - Zスコア
 * @returns 累積確率（0-1の範囲）
 */
function normalCDF(z: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp((-z * z) / 2);
    const prob =
        d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - prob : prob;
}

/**
 * ハイブリッド方式で必要な有意差の基準値を計算
 * 期間、CV数、PV数の3つの基準から最も厳しい基準値を採用
 * @param days - テスト期間（日数）
 * @param cv1 - バリアント1のコンバージョン数
 * @param cv2 - バリアント2のコンバージョン数
 * @param pv1 - バリアント1のページビュー数
 * @param pv2 - バリアント2のページビュー数
 * @returns 必要な有意差の基準値（期間ベース、CVベース、PVベース、および最終的な必要値）
 */
export function getRequiredSignificanceByHybrid(
    days: number,
    cv1: number,
    cv2: number,
    pv1: number,
    pv2: number
): {
    required: number;
    periodBased: number;
    cvBased: number;
    pvBased: number;
} {
    const minCV = Math.min(cv1, cv2);
    const minPV = Math.min(pv1, pv2);

    // 期間ベースの基準値
    let periodBased = 50;
    if (days >= 28) periodBased = 99;
    else if (days >= 21) periodBased = 95;
    else if (days >= 14) periodBased = 90;
    else if (days >= 7) periodBased = 85;
    else if (days >= 3) periodBased = 70;
    else periodBased = 50;

    // サンプルサイズ（CV数）ベースの基準値
    let cvBased = 50;
    if (minCV >= 1000) cvBased = 99;
    else if (minCV >= 500) cvBased = 95;
    else if (minCV >= 200) cvBased = 90;
    else if (minCV >= 100) cvBased = 85;
    else if (minCV >= 50) cvBased = 70;
    else cvBased = 50;

    // サンプルサイズ（PV数）ベースの基準値
    let pvBased = 50;
    if (minPV >= 10000) pvBased = 99;
    else if (minPV >= 5000) pvBased = 95;
    else if (minPV >= 2000) pvBased = 90;
    else if (minPV >= 1000) pvBased = 85;
    else if (minPV >= 500) pvBased = 70;
    else pvBased = 50;

    // 3つの基準の高い方を採用（より厳しい基準）
    const required = Math.max(periodBased, cvBased, pvBased);

    return {
        required,
        periodBased,
        cvBased,
        pvBased,
    };
}

/**
 * 期間の信憑性レベルを取得
 * テスト期間に基づいて信憑性レベルを判定（週次変動、月次変動の考慮）
 * @param days - テスト期間（日数）
 * @returns 信憑性レベル（レベル名、アイコン、説明）
 */
export function getPeriodReliabilityLevel(days: number): {
    level: string;
    icon: string;
    description: string;
} {
    if (days < 3) {
        return { level: '信憑性低', icon: '⚠️', description: '週次変動未考慮' };
    } else if (days < 7) {
        return { level: '信憑性低', icon: '⚠️', description: '1週間未満' };
    } else if (days < 14) {
        return { level: '信憑性中', icon: '⚠️', description: '1週間のみ' };
    } else if (days < 21) {
        return { level: '信憑性高', icon: '✅', description: '2週間、推奨' };
    } else if (days < 28) {
        return { level: '信憑性非常に高', icon: '✅', description: '3週間以上' };
    } else {
        return { level: '信憑性極めて高', icon: '✅', description: '月次変動も考慮' };
    }
}
