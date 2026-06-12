// =============================================================================
// Survey Types
// =============================================================================

export interface Survey {
  id: string;
  thinkific_response_id: string | null;
  company_id: string | null;
  learner_id: string | null;
  course_id: string | null;
  lesson_id: string | null;
  rating: number | null;
  feedback_text: string | null;
  proficiency_level: string | null;
  submitted_at: string | null;
  created_at: string;
  // Joined fields
  company_name?: string;
  learner_name?: string;
  course_name?: string;
}

export interface SurveyDashboard {
  average_rating: number;
  total_responses: number;
  satisfaction_rate: number;
  rating_distribution: RatingBucket[];
  rating_trend: RatingTrendPoint[];
  course_performance: CoursePerformance[];
  feedback_items: Survey[];
}

export interface RatingBucket {
  rating: number;
  count: number;
}

export interface RatingTrendPoint {
  date: string;
  average_rating: number;
  count: number;
}

export interface CoursePerformance {
  course_id: string;
  course_name: string;
  average_rating: number;
  response_count: number;
}
