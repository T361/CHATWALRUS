'use client';

import { useRouter } from 'next/navigation';

export default function TimelineToggle({
  slug,
  current,
}: {
  slug: string;
  current: 'calendar' | 'days';
}) {
  const router = useRouter();

  function toggle() {
    const next = current === 'calendar' ? 'days' : 'calendar';
    router.push(`/company/${slug}?view=${next}`);
  }

  const isCalendar = current === 'calendar';

  return (
    <button
      onClick={toggle}
      title={isCalendar ? 'Switch to days-since-start view' : 'Switch to calendar date view'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.375rem 0.75rem',
        borderRadius: '0.375rem',
        border: '1px solid #d1d5db',
        background: '#fff',
        fontSize: '0.75rem',
        color: '#374151',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {isCalendar ? '📅 Calendar' : '📊 Day #'}
      <span style={{ color: '#9ca3af', fontSize: '0.6875rem' }}>
        → {isCalendar ? 'Day #' : 'Calendar'}
      </span>
    </button>
  );
}
