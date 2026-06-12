import type { LearnerStatus } from '@/types/learner';

const STATUS_CONFIG: Record<LearnerStatus, { label: string; className: string }> = {
  not_started: { label: 'Not Started', className: 'badge badge-not-started' },
  at_risk: { label: 'At Risk', className: 'badge badge-at-risk' },
  slightly_behind: { label: 'Slightly Behind', className: 'badge badge-slightly-behind' },
  on_track: { label: 'On Track', className: 'badge badge-on-track' },
  high_engagement: { label: 'High Engagement', className: 'badge badge-high-engagement' },
};

export default function LearnerStatusBadge({ status }: { status: LearnerStatus }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.not_started;
  return <span className={config.className}>{config.label}</span>;
}
