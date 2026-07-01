import type { BQField } from './client'

// ============================================================
//  レポート実行ログ (Postgres report_executions ミラー)
//  用途: レポート/ABテスト実行の履歴を長期集計する
//  1 execution = 1 row。insertId = execution_id で dedup。
// ============================================================

export const REPORT_EXECUTION_LOG_SCHEMA: BQField[] = [
  { name: 'execution_id',   type: 'INT64',     mode: 'REQUIRED' },
  { name: 'report_id',      type: 'INT64'     },
  { name: 'product_id',     type: 'INT64'     },
  { name: 'report_type',    type: 'STRING'    },
  { name: 'report_name',    type: 'STRING'    },
  { name: 'status',         type: 'STRING'    },
  { name: 'config',         type: 'STRING'    },
  { name: 'result_summary', type: 'STRING'    },
  { name: 'started_at',     type: 'TIMESTAMP' },
  { name: 'completed_at',   type: 'TIMESTAMP' },
  { name: 'error_message',  type: 'STRING'    },
  { name: 'report_month',   type: 'STRING'    },
  { name: 'report_date',    type: 'DATE'      },
  { name: 'synced_at',      type: 'TIMESTAMP' },
]

export type ReportExecutionLogRow = {
  execution_id:   number
  report_id:      number | null
  product_id:     number | null
  report_type:    string | null
  report_name:    string | null
  status:         string
  config:         string | null
  result_summary: string | null
  started_at:     string | null
  completed_at:   string | null
  error_message:  string | null
  report_month:   string
  report_date:    string
  synced_at:      string
}

// ============================================================
//  AB テスト結果ログ (Postgres ab_test_results ミラー)
//  ab_test 側の勝者情報も同時に flatten して保存
// ============================================================

export const AB_TEST_RESULT_LOG_SCHEMA: BQField[] = [
  { name: 'result_id',                 type: 'INT64',     mode: 'REQUIRED' },
  { name: 'ab_test_id',                type: 'INT64'     },
  { name: 'product_id',                type: 'INT64'     },
  { name: 'ab_test_name',              type: 'STRING'    },
  { name: 'variant',                   type: 'STRING'    },
  { name: 'variant_a_name',            type: 'STRING'    },
  { name: 'variant_b_name',            type: 'STRING'    },
  { name: 'page_views',                type: 'INT64'     },
  { name: 'conversions',               type: 'INT64'     },
  { name: 'conversion_rate',           type: 'FLOAT64'   },
  { name: 'statistical_significance',  type: 'FLOAT64'   },
  { name: 'z_score',                   type: 'FLOAT64'   },
  { name: 'period_days',               type: 'INT64'     },
  { name: 'ai_evaluation',             type: 'STRING'    },
  { name: 'recommendation',            type: 'STRING'    },
  { name: 'winner_variant',            type: 'STRING'    },
  { name: 'improvement_vs_a_pct',      type: 'FLOAT64'   },
  { name: 'ab_test_status',            type: 'STRING'    },
  { name: 'start_date',                type: 'DATE'      },
  { name: 'end_date',                  type: 'DATE'      },
  { name: 'report_month',              type: 'STRING'    },
  { name: 'report_date',               type: 'DATE'      },
  { name: 'synced_at',                 type: 'TIMESTAMP' },
]

export type AbTestResultLogRow = {
  result_id:                number
  ab_test_id:               number | null
  product_id:               number | null
  ab_test_name:             string | null
  variant:                  string | null
  variant_a_name:           string | null
  variant_b_name:           string | null
  page_views:               number
  conversions:              number
  conversion_rate:          number | null
  statistical_significance: number | null
  z_score:                  number | null
  period_days:              number | null
  ai_evaluation:            string | null
  recommendation:           string | null
  winner_variant:           string | null
  improvement_vs_a_pct:     number | null
  ab_test_status:           string | null
  start_date:               string | null
  end_date:                 string | null
  report_month:             string
  report_date:              string
  synced_at:                string
}

// ============================================================
//  ファネル実行ログ (Postgres funnel_executions ミラー)
// ============================================================

export const FUNNEL_EXECUTION_LOG_SCHEMA: BQField[] = [
  { name: 'execution_id',      type: 'INT64',     mode: 'REQUIRED' },
  { name: 'product_id',        type: 'INT64'     },
  { name: 'execution_name',    type: 'STRING'    },
  { name: 'funnel_config',     type: 'STRING'    },
  { name: 'filter_config',     type: 'STRING'    },
  { name: 'start_date',        type: 'DATE'      },
  { name: 'end_date',          type: 'DATE'      },
  { name: 'result_data',       type: 'STRING'    },
  { name: 'gemini_evaluation', type: 'STRING'    },
  { name: 'status',            type: 'STRING'    },
  { name: 'error_message',     type: 'STRING'    },
  { name: 'report_month',      type: 'STRING'    },
  { name: 'report_date',       type: 'DATE'      },
  { name: 'synced_at',         type: 'TIMESTAMP' },
]

export type FunnelExecutionLogRow = {
  execution_id:      number
  product_id:        number | null
  execution_name:    string | null
  funnel_config:     string | null
  filter_config:     string | null
  start_date:        string | null
  end_date:          string | null
  result_data:       string | null
  gemini_evaluation: string | null
  status:            string
  error_message:     string | null
  report_month:      string
  report_date:       string
  synced_at:         string
}

// ============================================================
//  月次インサイトログ (現状 Postgres に保存されない)
//  BQ 側だけに append する。property_id + target_month + created_at で一意
// ============================================================

export const MONTHLY_INSIGHT_LOG_SCHEMA: BQField[] = [
  { name: 'insight_id',                type: 'STRING',    mode: 'REQUIRED' },
  { name: 'property_id',               type: 'STRING'    },
  { name: 'product_id',                type: 'INT64'     },
  { name: 'product_name',              type: 'STRING'    },
  { name: 'target_month',              type: 'STRING'    },
  { name: 'current_snapshot',          type: 'STRING'    },
  { name: 'previous_snapshot',         type: 'STRING'    },
  { name: 'weekly_breakdown_current',  type: 'STRING'    },
  { name: 'weekly_breakdown_previous', type: 'STRING'    },
  { name: 'ai_report',                 type: 'STRING'    },
  { name: 'created_at',                type: 'TIMESTAMP' },
  { name: 'synced_at',                 type: 'TIMESTAMP' },
]

export type MonthlyInsightLogRow = {
  insight_id:                string
  property_id:               string | null
  product_id:                number | null
  product_name:              string | null
  target_month:              string
  current_snapshot:          string | null
  previous_snapshot:         string | null
  weekly_breakdown_current:  string | null
  weekly_breakdown_previous: string | null
  ai_report:                 string | null
  created_at:                string
  synced_at:                 string
}

// ============================================================
//  AI 分析ログ (Gemini 呼び出し1回 = 1行)
//  ai-tools-dashboard.ai_analysis_log と同じ役割だが、
//  ga4-dashboard 側の全 Gemini 呼び出しを feature 別に記録する
// ============================================================

export const AI_ANALYSIS_LOG_SCHEMA: BQField[] = [
  { name: 'id',                type: 'STRING',    mode: 'REQUIRED' },
  { name: 'source',            type: 'STRING'    },
  { name: 'feature',           type: 'STRING'    },
  { name: 'function_name',     type: 'STRING'    },
  { name: 'model',             type: 'STRING'    },
  { name: 'prompt_tokens',     type: 'INT64'     },
  { name: 'completion_tokens', type: 'INT64'     },
  { name: 'total_tokens',      type: 'INT64'     },
  { name: 'product_id',        type: 'INT64'     },
  { name: 'report_month',      type: 'STRING'    },
  { name: 'report_date',       type: 'DATE'      },
  { name: 'created_at',        type: 'TIMESTAMP' },
  { name: 'synced_at',         type: 'TIMESTAMP' },
]

export type AiAnalysisLogRow = {
  id:                string
  source:            string
  feature:           string
  function_name:     string
  model:             string
  prompt_tokens:     number
  completion_tokens: number
  total_tokens:      number
  product_id:        number | null
  report_month:      string
  report_date:       string
  created_at:        string
  synced_at:         string
}

// ============================================================
//  ヒートマップイベントログ (Postgres heatmap_events ミラー)
//  write hook は heatmap POST endpoint 実装時に接続する。現状は schema のみ。
// ============================================================

export const HEATMAP_EVENT_LOG_SCHEMA: BQField[] = [
  { name: 'event_id',         type: 'INT64',     mode: 'REQUIRED' },
  { name: 'product_id',       type: 'INT64'     },
  { name: 'session_id',       type: 'STRING'    },
  { name: 'page_url',         type: 'STRING'    },
  { name: 'event_type',       type: 'STRING'    },
  { name: 'x',                type: 'INT64'     },
  { name: 'y',                type: 'INT64'     },
  { name: 'scroll_depth',     type: 'INT64'     },
  { name: 'viewport_width',   type: 'INT64'     },
  { name: 'viewport_height',  type: 'INT64'     },
  { name: 'element_selector', type: 'STRING'    },
  { name: 'metadata',         type: 'STRING'    },
  { name: 'event_timestamp',  type: 'TIMESTAMP' },
  { name: 'report_month',     type: 'STRING'    },
  { name: 'report_date',      type: 'DATE'      },
  { name: 'synced_at',        type: 'TIMESTAMP' },
]

export type HeatmapEventLogRow = {
  event_id:         number
  product_id:       number | null
  session_id:       string | null
  page_url:         string | null
  event_type:       string | null
  x:                number | null
  y:                number | null
  scroll_depth:     number | null
  viewport_width:   number | null
  viewport_height:  number | null
  element_selector: string | null
  metadata:         string | null
  event_timestamp:  string | null
  report_month:     string
  report_date:      string
  synced_at:        string
}

// ============================================================
//  同期実行ログ (cron / manual での BQ 同期の実行記録)
// ============================================================

export const SYNC_RUN_LOG_SCHEMA: BQField[] = [
  { name: 'run_id',      type: 'STRING',    mode: 'REQUIRED' },
  { name: 'target',      type: 'STRING'    },
  { name: 'started_at',  type: 'TIMESTAMP' },
  { name: 'ended_at',    type: 'TIMESTAMP' },
  { name: 'duration_ms', type: 'INT64'     },
  { name: 'status',      type: 'STRING'    },
  { name: 'rows_synced', type: 'INT64'     },
  { name: 'message',     type: 'STRING'    },
  { name: 'trigger',     type: 'STRING'    },
]

export type SyncRunLogRow = {
  run_id:      string
  target:      string
  started_at:  string
  ended_at:    string
  duration_ms: number
  status:      'success' | 'error'
  rows_synced: number
  message:     string | null
  trigger:     'cron' | 'manual'
}

// ============================================================
//  テーブル ID → schema のレジストリ
//  ensureAllBQTables で一括作成できる
// ============================================================

export const BQ_TABLES = {
  report_execution_log: REPORT_EXECUTION_LOG_SCHEMA,
  ab_test_result_log:   AB_TEST_RESULT_LOG_SCHEMA,
  funnel_execution_log: FUNNEL_EXECUTION_LOG_SCHEMA,
  monthly_insight_log:  MONTHLY_INSIGHT_LOG_SCHEMA,
  ai_analysis_log:      AI_ANALYSIS_LOG_SCHEMA,
  heatmap_event_log:    HEATMAP_EVENT_LOG_SCHEMA,
  sync_run_log:         SYNC_RUN_LOG_SCHEMA,
} as const

export type BQTableId = keyof typeof BQ_TABLES
