import type { EventLogAnalytics } from '@event-sharing/contracts';

export function EventStatusActivity({ data }: { data: EventLogAnalytics }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="text-xl font-semibold">Latest observed event status</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Based on retained Kafka snapshots, including events before the selected
        period.
      </p>
      <div className="mt-4 max-h-60 divide-y divide-neutral-200 overflow-y-auto text-sm">
        {data.eventStatuses.map((item) => (
          <div key={item.name} className="flex justify-between gap-3 py-2">
            <span>{item.name.replaceAll('_', ' ').toLowerCase()}</span>
            <span className="font-semibold tabular-nums">{item.count}</span>
          </div>
        ))}
        {!data.eventStatuses.length && (
          <p className="py-3 text-neutral-600">
            No event snapshots have been recorded yet.
          </p>
        )}
      </div>
    </section>
  );
}
