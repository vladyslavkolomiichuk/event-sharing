import type { EventLogAnalytics } from '@event-sharing/contracts';

export function CategoryActivity({ data }: { data: EventLogAnalytics }) {
  const maximum = Math.max(1, ...data.categories.map((item) => item.count));
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="text-xl font-semibold">Events created by category</h2>
      {data.categories.length ? (
        <div className="mt-5 space-y-3">
          {data.categories.map((item) => (
            <div key={item.name}>
              <div className="mb-1 flex justify-between gap-3 text-sm">
                <span className="truncate">{item.name}</span>
                <span className="tabular-nums">{item.count}</span>
              </div>
              <div className="h-2 bg-neutral-100">
                <div
                  className="h-full bg-neutral-900"
                  style={{ width: `${(item.count / maximum) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm text-neutral-600">
          No events were created in this period.
        </p>
      )}
    </section>
  );
}
