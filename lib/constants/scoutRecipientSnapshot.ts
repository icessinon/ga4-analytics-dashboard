/**
 * スカウト送信先 求職者属性スナップショット（自動生成: scripts/build-scout-snapshot.ts）。
 * ダッシュボード /scout の属性ブレイクダウン用。集計値のみ・個人情報なし。
 * 送信=DDB / 属性=Salesforce CustomObject1__c / 閲覧・応募=GA4。更新はスクリプト再実行。
 */
export const SCOUT_RECIPIENT_SNAPSHOT_ASOF = '2026-09-10'

export const SCOUT_RECIPIENT_SNAPSHOT = {
  "asof": "2026-09-10",
  "windowStart": "2026-06-09",
  "windowEnd": "2026-09-10",
  "note": "送信=DDB ScoutHistories / 属性=Salesforce CustomObject1__c(candidateId結合) / 閲覧・応募=GA4(scoutId)。集計値のみ・個人情報なし。属性は送信時点でSFに存在した候補者のみ結合。",
  "totals": {
    "sends": 4636,
    "matchedAttrs": 4636,
    "companies": 24,
    "jobs": 27,
    "viewedSends": 246,
    "appliedSends": 0
  },
  "usageOverall": {
    "sends": 4636,
    "companies": 24,
    "candidates": 4473,
    "jobs": 27,
    "viewRate": 5.3,
    "sendsPerCandidate": 1.04,
    "medianSendsPerCompany": 22,
    "top2Share": 74.9,
    "activeDays": 15,
    "firstAt": "2026-06-09",
    "lastAt": "2026-09-11"
  },
  "overall": {
    "ageBand": [
      [
        "20代",
        2039
      ],
      [
        "30代",
        1470
      ],
      [
        "40代",
        942
      ],
      [
        "10代",
        97
      ],
      [
        "50代",
        78
      ],
      [
        "60代以上",
        10
      ]
    ],
    "employment": [
      [
        "正社員",
        2995
      ],
      [
        "未入力",
        859
      ],
      [
        "アルバイト",
        377
      ],
      [
        "業務委託",
        307
      ],
      [
        "その他",
        72
      ],
      [
        "常勤",
        18
      ],
      [
        "派遣社員",
        8
      ]
    ],
    "timing": [
      [
        "なるべく早く",
        1463
      ],
      [
        "未定",
        1360
      ],
      [
        "未入力",
        593
      ],
      [
        "3ヶ月以内",
        462
      ],
      [
        "1ヶ月以内",
        413
      ],
      [
        "2ヶ月以内",
        343
      ],
      [
        "今は情報収集したい",
        2
      ]
    ],
    "prefecture": [
      [
        "神奈川県",
        2087
      ],
      [
        "東京都",
        1560
      ],
      [
        "愛媛県",
        399
      ],
      [
        "埼玉県",
        235
      ],
      [
        "愛知県",
        145
      ],
      [
        "千葉県",
        47
      ],
      [
        "広島県",
        33
      ],
      [
        "兵庫県",
        31
      ],
      [
        "大阪府",
        27
      ],
      [
        "静岡県",
        17
      ],
      [
        "茨城県",
        15
      ],
      [
        "福島県",
        8
      ]
    ],
    "licenses": [
      [
        "AT普通(H29/3以降)",
        771
      ],
      [
        "MT普通(H29/3以降)",
        630
      ],
      [
        "MT中型(8t限定)",
        472
      ],
      [
        "大型免許",
        467
      ],
      [
        "中型免許",
        461
      ],
      [
        "準中型免許",
        424
      ],
      [
        "フォークリフト",
        357
      ],
      [
        "MT準中型(5t限定)",
        343
      ],
      [
        "普通二種",
        236
      ],
      [
        "普通一種",
        230
      ],
      [
        "玉掛け",
        178
      ],
      [
        "AT(5t・8t限定)",
        146
      ],
      [
        "けん引免許",
        81
      ],
      [
        "第二種電気工事士",
        81
      ],
      [
        "普通一種（AT限定）",
        79
      ]
    ],
    "ageStats": {
      "mean": 33.8,
      "median": 32,
      "n": 4632
    }
  },
  "byCompany": [
    {
      "companyId": "1e037173-6d31-4b7e-b941-55dcf69c0866",
      "companyName": "株式会社エバーグリーンライン",
      "sends": 2168,
      "viewed": 155,
      "applied": 0,
      "matched": 2168,
      "usage": {
        "sharePct": 46.8,
        "candidates": 2168,
        "sendsPerCandidate": 1,
        "jobs": 1,
        "sendsPerJob": 2168,
        "activeDays": 5,
        "sendsPerActiveDay": 433.6,
        "firstAt": "2026-06-09",
        "lastAt": "2026-06-19",
        "viewRate": 7.1,
        "sentRate": 0
      },
      "ageBand": [
        [
          "40代",
          836
        ],
        [
          "20代",
          657
        ],
        [
          "30代",
          623
        ],
        [
          "10代",
          49
        ],
        [
          "50代",
          3
        ]
      ],
      "prefecture": [
        [
          "東京都",
          1357
        ],
        [
          "神奈川県",
          781
        ],
        [
          "千葉県",
          19
        ],
        [
          "埼玉県",
          6
        ],
        [
          "山梨県",
          1
        ],
        [
          "静岡県",
          1
        ],
        [
          "不明",
          1
        ],
        [
          "大阪府",
          1
        ]
      ],
      "employment": [
        [
          "正社員",
          1508
        ],
        [
          "未入力",
          351
        ],
        [
          "アルバイト",
          141
        ],
        [
          "業務委託",
          134
        ],
        [
          "その他",
          33
        ],
        [
          "常勤",
          1
        ]
      ],
      "timing": [
        [
          "なるべく早く",
          721
        ],
        [
          "未定",
          624
        ],
        [
          "3ヶ月以内",
          243
        ],
        [
          "1ヶ月以内",
          206
        ],
        [
          "未入力",
          189
        ],
        [
          "2ヶ月以内",
          185
        ]
      ],
      "licenses": [
        [
          "AT普通(H29/3以降)",
          392
        ],
        [
          "MT中型(8t限定)",
          326
        ],
        [
          "MT普通(H29/3以降)",
          303
        ],
        [
          "大型免許",
          302
        ],
        [
          "中型免許",
          251
        ],
        [
          "MT準中型(5t限定)",
          173
        ],
        [
          "フォークリフト",
          169
        ],
        [
          "準中型免許",
          162
        ],
        [
          "普通二種",
          144
        ],
        [
          "AT(5t・8t限定)",
          97
        ]
      ]
    },
    {
      "companyId": "2ed1aceb-ef23-4f29-9927-767289393d8b",
      "companyName": "シンクロジスティクス株式会社",
      "sends": 1306,
      "viewed": 46,
      "applied": 0,
      "matched": 1306,
      "usage": {
        "sharePct": 28.2,
        "candidates": 1306,
        "sendsPerCandidate": 1,
        "jobs": 1,
        "sendsPerJob": 1306,
        "activeDays": 3,
        "sendsPerActiveDay": 435.3,
        "firstAt": "2026-09-03",
        "lastAt": "2026-09-11",
        "viewRate": 3.5,
        "sentRate": 96.5
      },
      "ageBand": [
        [
          "20代",
          699
        ],
        [
          "30代",
          587
        ],
        [
          "10代",
          17
        ],
        [
          "60代以上",
          2
        ],
        [
          "50代",
          1
        ]
      ],
      "prefecture": [
        [
          "神奈川県",
          1302
        ],
        [
          "東京都",
          4
        ]
      ],
      "employment": [
        [
          "正社員",
          732
        ],
        [
          "未入力",
          302
        ],
        [
          "アルバイト",
          141
        ],
        [
          "業務委託",
          105
        ],
        [
          "その他",
          19
        ],
        [
          "派遣社員",
          4
        ],
        [
          "常勤",
          3
        ]
      ],
      "timing": [
        [
          "未定",
          419
        ],
        [
          "なるべく早く",
          405
        ],
        [
          "未入力",
          176
        ],
        [
          "3ヶ月以内",
          114
        ],
        [
          "1ヶ月以内",
          113
        ],
        [
          "2ヶ月以内",
          79
        ]
      ],
      "licenses": [
        [
          "AT普通(H29/3以降)",
          210
        ],
        [
          "MT普通(H29/3以降)",
          183
        ],
        [
          "準中型免許",
          134
        ],
        [
          "MT準中型(5t限定)",
          112
        ],
        [
          "中型免許",
          104
        ],
        [
          "フォークリフト",
          84
        ],
        [
          "大型免許",
          77
        ],
        [
          "普通二種",
          65
        ],
        [
          "普通一種",
          60
        ],
        [
          "MT中型(8t限定)",
          49
        ]
      ]
    },
    {
      "companyId": "f139717d-56c4-4d14-aeeb-1ca32b89f6f6",
      "companyName": "株式会社FUJIプランテック",
      "sends": 399,
      "viewed": 13,
      "applied": 0,
      "matched": 399,
      "usage": {
        "sharePct": 8.6,
        "candidates": 399,
        "sendsPerCandidate": 1,
        "jobs": 1,
        "sendsPerJob": 399,
        "activeDays": 1,
        "sendsPerActiveDay": 399,
        "firstAt": "2026-09-11",
        "lastAt": "2026-09-11",
        "viewRate": 3.3,
        "sentRate": 98.4
      },
      "ageBand": [
        [
          "20代",
          382
        ],
        [
          "10代",
          16
        ],
        [
          "60代以上",
          1
        ]
      ],
      "prefecture": [
        [
          "愛媛県",
          399
        ]
      ],
      "employment": [
        [
          "正社員",
          291
        ],
        [
          "未入力",
          45
        ],
        [
          "業務委託",
          25
        ],
        [
          "アルバイト",
          24
        ],
        [
          "常勤",
          6
        ],
        [
          "その他",
          5
        ],
        [
          "派遣社員",
          3
        ]
      ],
      "timing": [
        [
          "なるべく早く",
          122
        ],
        [
          "未定",
          120
        ],
        [
          "未入力",
          64
        ],
        [
          "1ヶ月以内",
          37
        ],
        [
          "3ヶ月以内",
          33
        ],
        [
          "2ヶ月以内",
          23
        ]
      ],
      "licenses": [
        [
          "MT普通(H29/3以降)",
          66
        ],
        [
          "AT普通(H29/3以降)",
          57
        ],
        [
          "大型免許",
          38
        ],
        [
          "準中型免許",
          33
        ],
        [
          "中型免許",
          25
        ],
        [
          "フォークリフト",
          22
        ],
        [
          "MT準中型(5t限定)",
          15
        ],
        [
          "玉掛け",
          10
        ],
        [
          "2級建築士",
          9
        ],
        [
          "普通一種",
          9
        ]
      ]
    },
    {
      "companyId": "6834a964-d351-4d23-9da8-1a200cd8dc48",
      "companyName": "有限会社中建工業",
      "sends": 179,
      "viewed": 1,
      "applied": 0,
      "matched": 179,
      "usage": {
        "sharePct": 3.9,
        "candidates": 179,
        "sendsPerCandidate": 1,
        "jobs": 1,
        "sendsPerJob": 179,
        "activeDays": 1,
        "sendsPerActiveDay": 179,
        "firstAt": "2026-08-21",
        "lastAt": "2026-08-21",
        "viewRate": 0.6,
        "sentRate": 67.6
      },
      "ageBand": [
        [
          "20代",
          120
        ],
        [
          "30代",
          55
        ],
        [
          "10代",
          2
        ],
        [
          "50代",
          1
        ],
        [
          "60代以上",
          1
        ]
      ],
      "prefecture": [
        [
          "東京都",
          108
        ],
        [
          "埼玉県",
          47
        ],
        [
          "千葉県",
          23
        ],
        [
          "大阪府",
          1
        ]
      ],
      "employment": [
        [
          "未入力",
          69
        ],
        [
          "正社員",
          53
        ],
        [
          "アルバイト",
          31
        ],
        [
          "業務委託",
          20
        ],
        [
          "その他",
          6
        ]
      ],
      "timing": [
        [
          "なるべく早く",
          61
        ],
        [
          "未入力",
          61
        ],
        [
          "未定",
          24
        ],
        [
          "1ヶ月以内",
          15
        ],
        [
          "2ヶ月以内",
          12
        ],
        [
          "3ヶ月以内",
          6
        ]
      ],
      "licenses": [
        [
          "AT普通(H29/3以降)",
          71
        ],
        [
          "MT普通(H29/3以降)",
          57
        ],
        [
          "普通一種",
          34
        ],
        [
          "普通一種（AT限定）",
          13
        ],
        [
          "フォークリフト",
          5
        ],
        [
          "大型免許",
          4
        ],
        [
          "MT準中型(5t限定)",
          3
        ],
        [
          "準中型免許",
          2
        ],
        [
          "中型免許",
          2
        ],
        [
          "2級建築士",
          2
        ]
      ]
    },
    {
      "companyId": "2f3e284a-69b7-4f23-bc11-86fa59516ce6",
      "companyName": "株式会社高星エンジニアリング",
      "sends": 153,
      "viewed": 2,
      "applied": 0,
      "matched": 153,
      "usage": {
        "sharePct": 3.3,
        "candidates": 153,
        "sendsPerCandidate": 1,
        "jobs": 1,
        "sendsPerJob": 153,
        "activeDays": 2,
        "sendsPerActiveDay": 76.5,
        "firstAt": "2026-09-10",
        "lastAt": "2026-09-11",
        "viewRate": 1.3,
        "sentRate": 98
      },
      "ageBand": [
        [
          "30代",
          87
        ],
        [
          "20代",
          48
        ],
        [
          "40代",
          16
        ],
        [
          "10代",
          2
        ]
      ],
      "prefecture": [
        [
          "埼玉県",
          153
        ]
      ],
      "employment": [
        [
          "正社員",
          103
        ],
        [
          "未入力",
          20
        ],
        [
          "アルバイト",
          14
        ],
        [
          "業務委託",
          9
        ],
        [
          "常勤",
          6
        ],
        [
          "その他",
          1
        ]
      ],
      "timing": [
        [
          "未定",
          54
        ],
        [
          "なるべく早く",
          43
        ],
        [
          "未入力",
          17
        ],
        [
          "3ヶ月以内",
          16
        ],
        [
          "1ヶ月以内",
          13
        ],
        [
          "2ヶ月以内",
          10
        ]
      ],
      "licenses": [
        [
          "準中型免許",
          25
        ],
        [
          "AT普通(H29/3以降)",
          21
        ],
        [
          "フォークリフト",
          16
        ],
        [
          "第二種電気工事士",
          11
        ],
        [
          "MT普通(H29/3以降)",
          10
        ],
        [
          "大型免許",
          10
        ],
        [
          "中型免許",
          9
        ],
        [
          "MT準中型(5t限定)",
          9
        ],
        [
          "普通一種",
          7
        ],
        [
          "AT(5t・8t限定)",
          5
        ]
      ]
    },
    {
      "companyId": "aaa0dbbc-ac08-4ca6-af8f-73760ddec007",
      "companyName": "株式会社富士ライン",
      "sends": 93,
      "viewed": 4,
      "applied": 0,
      "matched": 93,
      "usage": {
        "sharePct": 2,
        "candidates": 86,
        "sendsPerCandidate": 1.08,
        "jobs": 2,
        "sendsPerJob": 46.5,
        "activeDays": 1,
        "sendsPerActiveDay": 93,
        "firstAt": "2026-09-11",
        "lastAt": "2026-09-11",
        "viewRate": 4.3,
        "sentRate": 93.5
      },
      "ageBand": [
        [
          "40代",
          52
        ],
        [
          "50代",
          35
        ],
        [
          "10代",
          6
        ]
      ],
      "prefecture": [
        [
          "愛知県",
          93
        ]
      ],
      "employment": [
        [
          "正社員",
          77
        ],
        [
          "未入力",
          7
        ],
        [
          "アルバイト",
          4
        ],
        [
          "業務委託",
          3
        ],
        [
          "その他",
          2
        ]
      ],
      "timing": [
        [
          "未定",
          37
        ],
        [
          "なるべく早く",
          26
        ],
        [
          "2ヶ月以内",
          11
        ],
        [
          "3ヶ月以内",
          9
        ],
        [
          "1ヶ月以内",
          6
        ],
        [
          "未入力",
          2
        ],
        [
          "今は情報収集したい",
          2
        ]
      ],
      "licenses": [
        [
          "MT中型(8t限定)",
          52
        ],
        [
          "中型免許",
          42
        ],
        [
          "フォークリフト",
          20
        ],
        [
          "玉掛け",
          14
        ],
        [
          "大型免許",
          6
        ],
        [
          "普通二種",
          4
        ],
        [
          "MT準中型(5t限定)",
          4
        ],
        [
          "小型移動式クレーン",
          3
        ],
        [
          "けん引免許",
          2
        ],
        [
          "運行管理者(貨物)",
          2
        ]
      ]
    },
    {
      "companyId": "9e5a51e5-a08a-491d-8bd8-ea2e87909912",
      "companyName": "株式会社SAITO",
      "sends": 72,
      "viewed": 2,
      "applied": 0,
      "matched": 72,
      "usage": {
        "sharePct": 1.6,
        "candidates": 72,
        "sendsPerCandidate": 1,
        "jobs": 1,
        "sendsPerJob": 72,
        "activeDays": 3,
        "sendsPerActiveDay": 24,
        "firstAt": "2026-08-24",
        "lastAt": "2026-08-31",
        "viewRate": 2.8,
        "sentRate": 3.1
      },
      "ageBand": [
        [
          "30代",
          39
        ],
        [
          "20代",
          32
        ],
        [
          "10代",
          1
        ]
      ],
      "prefecture": [
        [
          "埼玉県",
          10
        ],
        [
          "東京都",
          10
        ],
        [
          "千葉県",
          5
        ],
        [
          "神奈川県",
          4
        ],
        [
          "福岡県",
          4
        ],
        [
          "愛知県",
          4
        ],
        [
          "宮城県",
          3
        ],
        [
          "兵庫県",
          3
        ]
      ],
      "employment": [
        [
          "正社員",
          54
        ],
        [
          "未入力",
          7
        ],
        [
          "アルバイト",
          5
        ],
        [
          "業務委託",
          3
        ],
        [
          "その他",
          3
        ]
      ],
      "timing": [
        [
          "未入力",
          26
        ],
        [
          "未定",
          19
        ],
        [
          "なるべく早く",
          15
        ],
        [
          "3ヶ月以内",
          7
        ],
        [
          "2ヶ月以内",
          4
        ],
        [
          "1ヶ月以内",
          1
        ]
      ],
      "licenses": [
        [
          "準中型免許",
          55
        ],
        [
          "フォークリフト",
          9
        ],
        [
          "大型免許",
          7
        ],
        [
          "中型免許",
          6
        ],
        [
          "玉掛け",
          6
        ],
        [
          "MT準中型(5t限定)",
          5
        ],
        [
          "けん引免許",
          3
        ],
        [
          "MT中型(8t限定)",
          2
        ],
        [
          "MT普通(H29/3以降)",
          2
        ],
        [
          "AT普通(H29/3以降)",
          2
        ]
      ]
    },
    {
      "companyId": "140fb3d4-e780-46ca-9f9f-d7e7981b0702",
      "companyName": "株式会社サンウエイ",
      "sends": 50,
      "viewed": 1,
      "applied": 0,
      "matched": 50,
      "usage": {
        "sharePct": 1.1,
        "candidates": 50,
        "sendsPerCandidate": 1,
        "jobs": 1,
        "sendsPerJob": 50,
        "activeDays": 1,
        "sendsPerActiveDay": 50,
        "firstAt": "2026-09-10",
        "lastAt": "2026-09-10",
        "viewRate": 2,
        "sentRate": 96
      },
      "ageBand": [
        [
          "20代",
          49
        ],
        [
          "10代",
          1
        ]
      ],
      "prefecture": [
        [
          "東京都",
          50
        ]
      ],
      "employment": [
        [
          "正社員",
          32
        ],
        [
          "未入力",
          11
        ],
        [
          "アルバイト",
          4
        ],
        [
          "常勤",
          1
        ],
        [
          "業務委託",
          1
        ],
        [
          "派遣社員",
          1
        ]
      ],
      "timing": [
        [
          "なるべく早く",
          14
        ],
        [
          "未入力",
          11
        ],
        [
          "未定",
          10
        ],
        [
          "3ヶ月以内",
          8
        ],
        [
          "2ヶ月以内",
          4
        ],
        [
          "1ヶ月以内",
          3
        ]
      ],
      "licenses": [
        [
          "普通一種",
          4
        ],
        [
          "第二種電気工事士",
          4
        ],
        [
          "準中型免許",
          4
        ],
        [
          "2級自動車整備士",
          3
        ],
        [
          "第一種電気工事士",
          3
        ],
        [
          "普通一種（AT限定）",
          3
        ],
        [
          "大型免許",
          2
        ],
        [
          "玉掛け",
          2
        ],
        [
          "MT普通(H29/3以降)",
          1
        ],
        [
          "ガス溶接技能者",
          1
        ]
      ]
    },
    {
      "companyId": "253d7d6b-1909-45ef-9a95-dc7b7b515a32",
      "companyName": "恒川建設株式会社",
      "sends": 32,
      "viewed": 1,
      "applied": 0,
      "matched": 32,
      "usage": {
        "sharePct": 0.7,
        "candidates": 32,
        "sendsPerCandidate": 1,
        "jobs": 1,
        "sendsPerJob": 32,
        "activeDays": 1,
        "sendsPerActiveDay": 32,
        "firstAt": "2026-09-10",
        "lastAt": "2026-09-10",
        "viewRate": 3.1,
        "sentRate": 100
      },
      "ageBand": [
        [
          "30代",
          19
        ],
        [
          "20代",
          10
        ],
        [
          "40代",
          3
        ]
      ],
      "prefecture": [
        [
          "愛知県",
          32
        ]
      ],
      "employment": [
        [
          "正社員",
          21
        ],
        [
          "未入力",
          10
        ],
        [
          "常勤",
          1
        ]
      ],
      "timing": [
        [
          "未入力",
          15
        ],
        [
          "未定",
          10
        ],
        [
          "なるべく早く",
          4
        ],
        [
          "3ヶ月以内",
          2
        ],
        [
          "1ヶ月以内",
          1
        ]
      ],
      "licenses": [
        [
          "1級土木施工管理技士",
          32
        ],
        [
          "普通一種",
          5
        ],
        [
          "1級建築施工管理技士",
          4
        ],
        [
          "1級土木施工管理技士補",
          2
        ],
        [
          "2級土木施工管理技士",
          2
        ],
        [
          "2級建築士",
          2
        ],
        [
          "第二種電気工事士",
          1
        ],
        [
          "2級建築施工管理技士",
          1
        ],
        [
          "1級管工事施工管理技士",
          1
        ],
        [
          "2級管工事施工管理技士",
          1
        ]
      ]
    },
    {
      "companyId": "431e23b8-086d-4c58-9b4c-e7310743b20d",
      "companyName": "株式会社宝塚かもめタクシー",
      "sends": 31,
      "viewed": 3,
      "applied": 0,
      "matched": 31,
      "usage": {
        "sharePct": 0.7,
        "candidates": 31,
        "sendsPerCandidate": 1,
        "jobs": 1,
        "sendsPerJob": 31,
        "activeDays": 1,
        "sendsPerActiveDay": 31,
        "firstAt": "2026-09-11",
        "lastAt": "2026-09-11",
        "viewRate": 9.7,
        "sentRate": 100
      },
      "ageBand": [
        [
          "40代",
          13
        ],
        [
          "20代",
          7
        ],
        [
          "30代",
          6
        ],
        [
          "50代",
          5
        ]
      ],
      "prefecture": [
        [
          "広島県",
          31
        ]
      ],
      "employment": [
        [
          "正社員",
          25
        ],
        [
          "アルバイト",
          3
        ],
        [
          "未入力",
          3
        ]
      ],
      "timing": [
        [
          "なるべく早く",
          9
        ],
        [
          "未定",
          9
        ],
        [
          "未入力",
          5
        ],
        [
          "3ヶ月以内",
          4
        ],
        [
          "1ヶ月以内",
          3
        ],
        [
          "2ヶ月以内",
          1
        ]
      ],
      "licenses": [
        [
          "フォークリフト",
          6
        ],
        [
          "MT中型(8t限定)",
          6
        ],
        [
          "玉掛け",
          4
        ],
        [
          "中型免許",
          3
        ],
        [
          "大型免許",
          3
        ],
        [
          "MT準中型(5t限定)",
          3
        ],
        [
          "普通一種",
          3
        ],
        [
          "2級土木施工管理技士",
          2
        ],
        [
          "準中型免許",
          2
        ],
        [
          "第二種電気工事士",
          2
        ]
      ]
    },
    {
      "companyId": "36d3cc5d-bcbf-497d-99d9-9fce61d8de47",
      "companyName": "株式会社スマ家サポート",
      "sends": 22,
      "viewed": 1,
      "applied": 0,
      "matched": 22,
      "usage": {
        "sharePct": 0.5,
        "candidates": 22,
        "sendsPerCandidate": 1,
        "jobs": 1,
        "sendsPerJob": 22,
        "activeDays": 1,
        "sendsPerActiveDay": 22,
        "firstAt": "2026-08-19",
        "lastAt": "2026-08-19",
        "viewRate": 4.5,
        "sentRate": 54.5
      },
      "ageBand": [
        [
          "20代",
          11
        ],
        [
          "30代",
          10
        ],
        [
          "10代",
          1
        ]
      ],
      "prefecture": [
        [
          "大阪府",
          22
        ]
      ],
      "employment": [
        [
          "正社員",
          12
        ],
        [
          "未入力",
          5
        ],
        [
          "アルバイト",
          4
        ],
        [
          "業務委託",
          1
        ]
      ],
      "timing": [
        [
          "なるべく早く",
          8
        ],
        [
          "未入力",
          7
        ],
        [
          "3ヶ月以内",
          4
        ],
        [
          "未定",
          2
        ],
        [
          "1ヶ月以内",
          1
        ]
      ],
      "licenses": [
        [
          "AT普通(H29/3以降)",
          13
        ],
        [
          "普通一種（AT限定）",
          3
        ],
        [
          "第二種電気工事士",
          2
        ],
        [
          "普通二種",
          2
        ],
        [
          "普通一種",
          2
        ],
        [
          "第一種電気工事士",
          1
        ],
        [
          "MT中型(8t限定)",
          1
        ],
        [
          "大型免許",
          1
        ],
        [
          "MT普通(H29/3以降)",
          1
        ],
        [
          "大型特殊免許",
          1
        ]
      ]
    },
    {
      "companyId": "c6155be7-b45e-4997-a80f-bad9ef90837f",
      "companyName": "リックキッズ株式会社",
      "sends": 22,
      "viewed": 0,
      "applied": 0,
      "matched": 22,
      "usage": {
        "sharePct": 0.5,
        "candidates": 22,
        "sendsPerCandidate": 1,
        "jobs": 2,
        "sendsPerJob": 11,
        "activeDays": 1,
        "sendsPerActiveDay": 22,
        "firstAt": "2026-09-10",
        "lastAt": "2026-09-10",
        "viewRate": 0,
        "sentRate": 100
      },
      "ageBand": [
        [
          "50代",
          18
        ],
        [
          "60代以上",
          4
        ]
      ],
      "prefecture": [
        [
          "東京都",
          22
        ]
      ],
      "employment": [
        [
          "正社員",
          13
        ],
        [
          "業務委託",
          4
        ],
        [
          "未入力",
          2
        ],
        [
          "その他",
          2
        ],
        [
          "アルバイト",
          1
        ]
      ],
      "timing": [
        [
          "なるべく早く",
          8
        ],
        [
          "1ヶ月以内",
          4
        ],
        [
          "2ヶ月以内",
          4
        ],
        [
          "3ヶ月以内",
          3
        ],
        [
          "未定",
          3
        ]
      ],
      "licenses": [
        [
          "MT中型(8t限定)",
          10
        ],
        [
          "中型免許",
          8
        ],
        [
          "フォークリフト",
          4
        ],
        [
          "MT普通(H29/3以降)",
          3
        ],
        [
          "大型免許",
          3
        ],
        [
          "普通二種",
          2
        ],
        [
          "大型二種",
          1
        ],
        [
          "玉掛け",
          1
        ],
        [
          "車両系建設機械",
          1
        ],
        [
          "小型移動式クレーン(ユニック)",
          1
        ]
      ]
    }
  ],
  "byJob": [
    {
      "jobId": "media_6593108",
      "companyId": "1e037173-6d31-4b7e-b941-55dcf69c0866",
      "sends": 2168,
      "viewed": 155,
      "applied": 0,
      "ageBand": [
        [
          "40代",
          836
        ],
        [
          "20代",
          657
        ],
        [
          "30代",
          623
        ]
      ],
      "prefecture": [
        [
          "東京都",
          1357
        ],
        [
          "神奈川県",
          781
        ],
        [
          "千葉県",
          19
        ]
      ],
      "licenses": [
        [
          "AT普通(H29/3以降)",
          392
        ],
        [
          "MT中型(8t限定)",
          326
        ],
        [
          "MT普通(H29/3以降)",
          303
        ],
        [
          "大型免許",
          302
        ]
      ]
    },
    {
      "jobId": "media_7006158",
      "companyId": "2ed1aceb-ef23-4f29-9927-767289393d8b",
      "sends": 1306,
      "viewed": 46,
      "applied": 0,
      "ageBand": [
        [
          "20代",
          699
        ],
        [
          "30代",
          587
        ],
        [
          "10代",
          17
        ]
      ],
      "prefecture": [
        [
          "神奈川県",
          1302
        ],
        [
          "東京都",
          4
        ]
      ],
      "licenses": [
        [
          "AT普通(H29/3以降)",
          210
        ],
        [
          "MT普通(H29/3以降)",
          183
        ],
        [
          "準中型免許",
          134
        ],
        [
          "MT準中型(5t限定)",
          112
        ]
      ]
    },
    {
      "jobId": "media_3837201",
      "companyId": "f139717d-56c4-4d14-aeeb-1ca32b89f6f6",
      "sends": 399,
      "viewed": 13,
      "applied": 0,
      "ageBand": [
        [
          "20代",
          382
        ],
        [
          "10代",
          16
        ],
        [
          "60代以上",
          1
        ]
      ],
      "prefecture": [
        [
          "愛媛県",
          399
        ]
      ],
      "licenses": [
        [
          "MT普通(H29/3以降)",
          66
        ],
        [
          "AT普通(H29/3以降)",
          57
        ],
        [
          "大型免許",
          38
        ],
        [
          "準中型免許",
          33
        ]
      ]
    },
    {
      "jobId": "media_6694189",
      "companyId": "6834a964-d351-4d23-9da8-1a200cd8dc48",
      "sends": 179,
      "viewed": 1,
      "applied": 0,
      "ageBand": [
        [
          "20代",
          120
        ],
        [
          "30代",
          55
        ],
        [
          "10代",
          2
        ]
      ],
      "prefecture": [
        [
          "東京都",
          108
        ],
        [
          "埼玉県",
          47
        ],
        [
          "千葉県",
          23
        ]
      ],
      "licenses": [
        [
          "AT普通(H29/3以降)",
          71
        ],
        [
          "MT普通(H29/3以降)",
          57
        ],
        [
          "普通一種",
          34
        ],
        [
          "普通一種（AT限定）",
          13
        ]
      ]
    },
    {
      "jobId": "media_3837471",
      "companyId": "2f3e284a-69b7-4f23-bc11-86fa59516ce6",
      "sends": 153,
      "viewed": 2,
      "applied": 0,
      "ageBand": [
        [
          "30代",
          87
        ],
        [
          "20代",
          48
        ],
        [
          "40代",
          16
        ]
      ],
      "prefecture": [
        [
          "埼玉県",
          153
        ]
      ],
      "licenses": [
        [
          "準中型免許",
          25
        ],
        [
          "AT普通(H29/3以降)",
          21
        ],
        [
          "フォークリフト",
          16
        ],
        [
          "第二種電気工事士",
          11
        ]
      ]
    },
    {
      "jobId": "media_07399",
      "companyId": "aaa0dbbc-ac08-4ca6-af8f-73760ddec007",
      "sends": 86,
      "viewed": 3,
      "applied": 0,
      "ageBand": [
        [
          "40代",
          47
        ],
        [
          "50代",
          35
        ],
        [
          "10代",
          4
        ]
      ],
      "prefecture": [
        [
          "愛知県",
          86
        ]
      ],
      "licenses": [
        [
          "MT中型(8t限定)",
          51
        ],
        [
          "中型免許",
          36
        ],
        [
          "フォークリフト",
          19
        ],
        [
          "玉掛け",
          13
        ]
      ]
    },
    {
      "jobId": "media_7017910",
      "companyId": "9e5a51e5-a08a-491d-8bd8-ea2e87909912",
      "sends": 72,
      "viewed": 2,
      "applied": 0,
      "ageBand": [
        [
          "30代",
          39
        ],
        [
          "20代",
          32
        ],
        [
          "10代",
          1
        ]
      ],
      "prefecture": [
        [
          "埼玉県",
          10
        ],
        [
          "東京都",
          10
        ],
        [
          "千葉県",
          5
        ]
      ],
      "licenses": [
        [
          "準中型免許",
          55
        ],
        [
          "フォークリフト",
          9
        ],
        [
          "大型免許",
          7
        ],
        [
          "中型免許",
          6
        ]
      ]
    },
    {
      "jobId": "media_93040",
      "companyId": "140fb3d4-e780-46ca-9f9f-d7e7981b0702",
      "sends": 50,
      "viewed": 1,
      "applied": 0,
      "ageBand": [
        [
          "20代",
          49
        ],
        [
          "10代",
          1
        ]
      ],
      "prefecture": [
        [
          "東京都",
          50
        ]
      ],
      "licenses": [
        [
          "普通一種",
          4
        ],
        [
          "第二種電気工事士",
          4
        ],
        [
          "準中型免許",
          4
        ],
        [
          "2級自動車整備士",
          3
        ]
      ]
    }
  ],
  "funnelByAttr": {
    "ageBand": [
      {
        "key": "20代",
        "sends": 2039,
        "viewed": 55,
        "applied": 0,
        "viewRate": 2.7,
        "applyRate": 0
      },
      {
        "key": "30代",
        "sends": 1470,
        "viewed": 87,
        "applied": 0,
        "viewRate": 5.9,
        "applyRate": 0
      },
      {
        "key": "40代",
        "sends": 942,
        "viewed": 89,
        "applied": 0,
        "viewRate": 9.4,
        "applyRate": 0
      },
      {
        "key": "10代",
        "sends": 97,
        "viewed": 6,
        "applied": 0,
        "viewRate": 6.2,
        "applyRate": 0
      },
      {
        "key": "50代",
        "sends": 78,
        "viewed": 7,
        "applied": 0,
        "viewRate": 9,
        "applyRate": 0
      },
      {
        "key": "60代以上",
        "sends": 10,
        "viewed": 2,
        "applied": 0,
        "viewRate": 20,
        "applyRate": 0
      }
    ],
    "prefecture": [
      {
        "key": "神奈川県",
        "sends": 2087,
        "viewed": 120,
        "applied": 0,
        "viewRate": 5.7,
        "applyRate": 0
      },
      {
        "key": "東京都",
        "sends": 1560,
        "viewed": 82,
        "applied": 0,
        "viewRate": 5.3,
        "applyRate": 0
      },
      {
        "key": "愛媛県",
        "sends": 399,
        "viewed": 13,
        "applied": 0,
        "viewRate": 3.3,
        "applyRate": 0
      },
      {
        "key": "埼玉県",
        "sends": 235,
        "viewed": 4,
        "applied": 0,
        "viewRate": 1.7,
        "applyRate": 0
      },
      {
        "key": "愛知県",
        "sends": 145,
        "viewed": 8,
        "applied": 0,
        "viewRate": 5.5,
        "applyRate": 0
      },
      {
        "key": "千葉県",
        "sends": 47,
        "viewed": 1,
        "applied": 0,
        "viewRate": 2.1,
        "applyRate": 0
      },
      {
        "key": "広島県",
        "sends": 33,
        "viewed": 3,
        "applied": 0,
        "viewRate": 9.1,
        "applyRate": 0
      },
      {
        "key": "兵庫県",
        "sends": 31,
        "viewed": 3,
        "applied": 0,
        "viewRate": 9.7,
        "applyRate": 0
      },
      {
        "key": "大阪府",
        "sends": 27,
        "viewed": 1,
        "applied": 0,
        "viewRate": 3.7,
        "applyRate": 0
      },
      {
        "key": "静岡県",
        "sends": 17,
        "viewed": 4,
        "applied": 0,
        "viewRate": 23.5,
        "applyRate": 0
      }
    ],
    "employment": [
      {
        "key": "正社員",
        "sends": 2995,
        "viewed": 193,
        "applied": 0,
        "viewRate": 6.4,
        "applyRate": 0
      },
      {
        "key": "未入力",
        "sends": 859,
        "viewed": 26,
        "applied": 0,
        "viewRate": 3,
        "applyRate": 0
      },
      {
        "key": "アルバイト",
        "sends": 377,
        "viewed": 9,
        "applied": 0,
        "viewRate": 2.4,
        "applyRate": 0
      },
      {
        "key": "業務委託",
        "sends": 307,
        "viewed": 11,
        "applied": 0,
        "viewRate": 3.6,
        "applyRate": 0
      },
      {
        "key": "その他",
        "sends": 72,
        "viewed": 5,
        "applied": 0,
        "viewRate": 6.9,
        "applyRate": 0
      },
      {
        "key": "常勤",
        "sends": 18,
        "viewed": 1,
        "applied": 0,
        "viewRate": 5.6,
        "applyRate": 0
      },
      {
        "key": "派遣社員",
        "sends": 8,
        "viewed": 1,
        "applied": 0,
        "viewRate": 12.5,
        "applyRate": 0
      }
    ],
    "timing": [
      {
        "key": "なるべく早く",
        "sends": 1463,
        "viewed": 54,
        "applied": 0,
        "viewRate": 3.7,
        "applyRate": 0
      },
      {
        "key": "未定",
        "sends": 1360,
        "viewed": 98,
        "applied": 0,
        "viewRate": 7.2,
        "applyRate": 0
      },
      {
        "key": "未入力",
        "sends": 593,
        "viewed": 31,
        "applied": 0,
        "viewRate": 5.2,
        "applyRate": 0
      },
      {
        "key": "3ヶ月以内",
        "sends": 462,
        "viewed": 23,
        "applied": 0,
        "viewRate": 5,
        "applyRate": 0
      },
      {
        "key": "1ヶ月以内",
        "sends": 413,
        "viewed": 24,
        "applied": 0,
        "viewRate": 5.8,
        "applyRate": 0
      },
      {
        "key": "2ヶ月以内",
        "sends": 343,
        "viewed": 16,
        "applied": 0,
        "viewRate": 4.7,
        "applyRate": 0
      },
      {
        "key": "今は情報収集したい",
        "sends": 2,
        "viewed": 0,
        "applied": 0,
        "viewRate": 0,
        "applyRate": 0
      }
    ],
    "license": [
      {
        "key": "大型免許なし",
        "sends": 4082,
        "viewed": 205,
        "applied": 0,
        "viewRate": 5,
        "applyRate": 0
      },
      {
        "key": "大型免許あり",
        "sends": 554,
        "viewed": 41,
        "applied": 0,
        "viewRate": 7.4,
        "applyRate": 0
      }
    ]
  }
} as const
