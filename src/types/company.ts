// =============================================================================
// Company Types
// =============================================================================

export interface Company {
  id: string;
  name: string;
  slug: string;
  thinkific_company_id: string | null;
  thinkific_group_id: string | null;
  start_date: string | null;
  end_date: string | null;
  learning_timeline_days: number;
  risk_threshold_percent: number;
  slack_channel_id: string | null;
  csm_owner_id: string | null;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyWithMetrics extends Company {
  learner_count: number;
  average_progress: number;
  at_risk_count: number;
  on_track_count: number;
  high_engagement_count: number;
  not_started_count: number;
  slightly_behind_count: number;
}

export interface CompanyDashboard {
  company: Company;
  total_enrolled: number;
  course_completions: number;
  median_quiz_score: number | null;
  assignment_submission_rate: number | null;
  on_pace_percent: number;
  slightly_behind_count: number;
  at_risk_count: number;
  average_progress: number;
  not_started_count: number;
  high_engagement_count: number;
  on_track_count: number;
  status_distribution: StatusDistribution;
  alerts: Alert[];
}

export interface StatusDistribution {
  not_started: number;
  at_risk: number;
  slightly_behind: number;
  on_track: number;
  high_engagement: number;
}

export interface Alert {
  id: string;
  company_id: string;
  milestone_check_id: string | null;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  actioned_by: string | null;
  actioned_at: string | null;
  slack_sent_at: string | null;
  created_at: string;
  updated_at: string;
}
