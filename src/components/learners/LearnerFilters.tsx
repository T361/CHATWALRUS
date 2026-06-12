import type { LearnerStatus } from '@/types/learner';

interface LearnerFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  departmentFilter?: string;
  onDepartmentFilterChange?: (value: string) => void;
  departments?: string[];
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'not_started' satisfies LearnerStatus, label: 'Not Started' },
  { value: 'at_risk' satisfies LearnerStatus, label: 'At Risk' },
  { value: 'slightly_behind' satisfies LearnerStatus, label: 'Slightly Behind' },
  { value: 'on_track' satisfies LearnerStatus, label: 'On Track' },
  { value: 'high_engagement' satisfies LearnerStatus, label: 'High Engagement' },
];

export default function LearnerFilters({
  search, onSearchChange, statusFilter, onStatusFilterChange,
  departmentFilter, onDepartmentFilterChange, departments,
}: LearnerFiltersProps) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
      <input
        type="text"
        placeholder="Search by name or email..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{ flex: 1, minWidth: '200px' }}
      />
      <select value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)}>
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {departments && departments.length > 0 && onDepartmentFilterChange && (
        <select value={departmentFilter || 'all'} onChange={(e) => onDepartmentFilterChange(e.target.value)}>
          <option value="all">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      )}
    </div>
  );
}
