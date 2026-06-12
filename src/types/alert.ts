// =============================================================================
// Alert Types
// =============================================================================

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'open' | 'reviewed' | 'actioned' | 'dismissed';
export type AlertType =
  | 'average_below_benchmark'
  | 'risk_concentration'
  | 'not_started_warning'
  | 'custom';

export interface MilestoneCheck {
  id: string;
  company_id: string;
  milestone_day: number;
  benchmark_percent: number;
  average_completion_percent: number;
  at_risk_percent: number;
  not_started_count: number;
  slightly_behind_count: number;
  at_risk_count: number;
  on_track_count: number;
  high_engagement_count: number;
  alert_triggered: boolean;
  checked_at: string;
  created_at: string;
}

export interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_processed: number;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Passcode {
  id: string;
  code: string;
  role: string;
  company_id: string | null;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}
