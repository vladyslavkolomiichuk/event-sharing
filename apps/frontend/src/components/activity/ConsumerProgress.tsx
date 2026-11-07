import type { EventLogAnalytics } from '@event-sharing/contracts';

export function ConsumerProgress({ data }: { data: EventLogAnalytics }) {
  const topics = new Map<string, Date>();
  for (const item of data.progress) {
    const observed = new Date(item.receivedAt);
    const previous = topics.get(item.topic);
    if (!previous || observed > previous) topics.set(item.topic, observed);
  }
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="text-xl font-semibold">Kafka consumption</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Last recorded message by topic. This is not broker lag.
      </p>
      <div className="mt-4 max-h-64 overflow-y-auto divide-y divide-neutral-200 text-sm">
        {[...topics].map(([topic, date]) => (
          <div
            key={topic}
            className="flex flex-wrap justify-between gap-2 py-2"
          >
            <span>
              {topic.replace('event-sharing.', '').replace('.v1', '')}
            </span>
            <time dateTime={date.toISOString()} className="text-neutral-600">
              {date.toLocaleString('en-US')}
            </time>
          </div>
        ))}
        {!topics.size && (
          <p className="py-3 text-neutral-600">
            No Kafka messages have been recorded yet.
          </p>
        )}
      </div>
    </section>
  );
}
