import type { EventLogAnalytics } from '@event-sharing/contracts';

export function ActivityTrend({ data }: { data: EventLogAnalytics }) {
  const counts = new Map<string, number>();
  for (const item of data.daily)
    counts.set(item.day, (counts.get(item.day) ?? 0) + item.count);
  const days = Array.from({ length: data.days }, (_, index) => {
    const day = new Date(data.through);
    day.setUTCDate(day.getUTCDate() - (data.days - index - 1));
    return day.toISOString().slice(0, 10);
  });
  const maximum = Math.max(1, ...counts.values());

  return (
    <section
      className="rounded-xl border border-neutral-200 bg-white p-5"
      aria-label="Daily activity"
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">Daily activity</h2>
        <span className="text-xs text-neutral-500">Kafka domain events</span>
      </div>
      <div className="overflow-x-auto">
        <div
          className="flex h-36 min-w-[540px] items-end gap-1 border-b border-neutral-300"
          role="img"
          aria-label="Daily event counts"
        >
          {days.map((day) => (
            <div
              key={day}
              className="flex h-full min-w-1 flex-1 items-end"
              title={`${day}: ${counts.get(day) ?? 0} events`}
            >
              <div
                className="w-full bg-neutral-900"
                style={{
                  height: counts.get(day)
                    ? `${Math.max(2, ((counts.get(day) ?? 0) / maximum) * 100)}%`
                    : '0%',
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-neutral-500">
          <span>{days[0]}</span>
          <span>{days.at(-1)}</span>
        </div>
      </div>
    </section>
  );
}
