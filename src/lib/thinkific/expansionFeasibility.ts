import 'server-only';

type FeasibilityVerdict =
  | 'supported_via_rest'
  | 'supported_via_graphql'
  | 'not_retrievable_with_current_integration';

type SupportState = 'supported' | 'unsupported' | 'unconfigured';

export interface ThinkificExpansionFeasibility {
  feature: 'detailed_quiz_scores' | 'certificates';
  verdict: FeasibilityVerdict;
  rest_support: SupportState;
  graphql_support: SupportState;
  minimum_required_fields: string[];
  available_now: string[];
  reason: string;
  next_steps: string[];
}

function hasThinkificRestConfig(): boolean {
  return !!(process.env.THINKIFIC_API_KEY && process.env.THINKIFIC_SUBDOMAIN);
}

function hasThinkificGraphqlConfig(): boolean {
  return !!(process.env.THINKIFIC_GRAPHQL_URL && process.env.THINKIFIC_GRAPHQL_TOKEN);
}

export function getDetailedQuizScoreFeasibility(): ThinkificExpansionFeasibility {
  const graphqlConfigured = hasThinkificGraphqlConfig();

  return {
    feature: 'detailed_quiz_scores',
    verdict: 'not_retrievable_with_current_integration',
    rest_support: 'unsupported',
    graphql_support: graphqlConfigured ? 'supported' : 'unconfigured',
    minimum_required_fields: [
      'attempt_id',
      'learner_id',
      'course_id',
      'quiz_id',
      'attempted_at',
      'score_or_percent',
      'pass_fail',
      'per_question_detail',
    ],
    available_now: hasThinkificRestConfig()
      ? [
          'quiz completion inferred from lesson progress',
          'thinkific_quiz_id',
          'learner_id',
          'company_id',
          'course_id',
          'lesson_id',
          'attempted_at',
          'pass flag',
        ]
      : [],
    reason: graphqlConfigured
      ? 'The current REST integration does not expose detailed quiz-score retrieval in this codebase. GraphQL transport is configured, but detailed quiz retrieval is still unverified and therefore not yet retrievable through the current implementation.'
      : 'The current REST integration only yields coarse quiz-completion records inferred from course progress. No GraphQL transport is configured in the repo, so detailed quiz scores are not retrievable with the current integration.',
    next_steps: graphqlConfigured
      ? [
          'Implement a bounded GraphQL retrieval spike for quiz attempts and question-level results.',
          'Verify stable upstream attempt identifiers before adding storage.',
        ]
      : [
          'Keep using current coarse quiz rows for existing assessment screens.',
          'Add Thinkific GraphQL configuration before attempting detailed score retrieval.',
        ],
  };
}

export function getCertificateFeasibility(): ThinkificExpansionFeasibility {
  const graphqlConfigured = hasThinkificGraphqlConfig();

  return {
    feature: 'certificates',
    verdict: 'not_retrievable_with_current_integration',
    rest_support: 'unsupported',
    graphql_support: graphqlConfigured ? 'supported' : 'unconfigured',
    minimum_required_fields: [
      'certificate_id_or_issuance_id',
      'learner_id',
      'course_id',
      'issued_at',
      'status',
    ],
    available_now: [],
    reason: graphqlConfigured
      ? 'No certificate retrieval path exists in the current REST integration. GraphQL transport is configured, but certificate retrieval is still unverified and therefore not yet retrievable through the current implementation.'
      : 'No certificate retrieval path exists in the current REST integration and no GraphQL transport is configured in the repo, so certificates are not retrievable with the current integration.',
    next_steps: graphqlConfigured
      ? [
          'Implement a bounded GraphQL spike to verify certificate issuance data and stable identifiers.',
          'Only add persistence after the upstream certificate shape is confirmed.',
        ]
      : [
          'Do not infer certificate completions from enrollment completion.',
          'Add Thinkific GraphQL configuration before attempting certificate retrieval.',
        ],
  };
}

export function getThinkificExpansionFeasibilityReport() {
  return {
    thinkific_rest_configured: hasThinkificRestConfig(),
    thinkific_graphql_configured: hasThinkificGraphqlConfig(),
    generated_at: new Date().toISOString(),
    capabilities: [
      getDetailedQuizScoreFeasibility(),
      getCertificateFeasibility(),
    ],
  };
}
