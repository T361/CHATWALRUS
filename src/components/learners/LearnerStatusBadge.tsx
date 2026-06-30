import type { LearnerStatus } from '@/types/learner';

const STATUS_CONFIG: Partial<Record<LearnerStatus, { label: string; className: string }>> = {
  not_started:    { label: 'Not Started',    className: 'badge badge-not-started' },
  high_engagement:{ label: 'High Engagement',className: 'badge badge-high-engagement' },
};

export default function LearnerStatusBadge({ status }: { status: LearnerStatus }) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;
  return <span className={config.className}>{config.label}</span>;
}
