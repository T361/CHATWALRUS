// =============================================================================
// Zoom Types
// =============================================================================

export interface ZoomSession {
  id: string;
  zoom_meeting_id: string | null;
  topic: string | null;
  host_email: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  session_type: string | null;
  created_at: string;
}

export interface ZoomAttendance {
  id: string;
  zoom_session_id: string;
  learner_id: string | null;
  company_id: string | null;
  attendee_name: string | null;
  attendee_email: string | null;
  join_time: string | null;
  leave_time: string | null;
  duration_minutes: number | null;
  attended: boolean;
  created_at: string;
}

export interface LearnerSessionHistoryItem extends ZoomAttendance {
  session_topic: string | null;
  session_type: string | null;
  session_host_email: string | null;
  session_start_time: string | null;
  session_end_time: string | null;
}

export interface ZoomTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface ZoomMeeting {
  id: number;
  uuid: string;
  topic: string;
  start_time: string;
  end_time: string;
  duration: number;
  type: number;
  host_id: string;
}

export interface ZoomParticipant {
  id: string;
  name: string;
  user_email: string;
  join_time: string;
  leave_time: string;
  duration: number;
}
