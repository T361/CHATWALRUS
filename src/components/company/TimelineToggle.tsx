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
    <div className="timeline-toggle">
      <button
        onClick={toggle}
        className={`timeline-opt${isCalendar ? ' timeline-opt-active' : ''}`}
        title="Calendar dates"
      >
        Calendar
      </button>
      <button
        onClick={toggle}
        className={`timeline-opt${!isCalendar ? ' timeline-opt-active' : ''}`}
        title="Days since program start"
      >
        Day #
      </button>
    </div>
  );
}
