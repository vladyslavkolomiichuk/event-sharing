import type { EventLogAnalytics } from '@event-sharing/contracts';

const metrics = [
  ['user.registered', 'New users'],
  ['event.created', 'Events created'],
  ['event.cancelled', 'Events cancelled'],
  ['user.joined', 'Registrations'],
  ['user.left', 'Registrations left'],
  ['search.performed', 'Search requests'],
  ['registration.policy.rejected', 'Policy failures'],
  ['notification.sent', 'Emails sent'],
  ['notification.failed', 'Email failures'],
] as const;

export function AnalyticsOverview({ data }: { data: EventLogAnalytics }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metrics.map(([type, label]) => (
          <div
            key={type}
            className="rounded-xl border border-neutral-200 bg-white p-4"
          >
            <p className="text-xs text-neutral-600">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {data.totals[type] ?? 0}
            </p>
          </div>
        ))}
      </div>
      <p className="text-sm text-neutral-600">
        {data.activeActors} identified users acted during this period. Search
        requests are anonymous in analytics and are not included in this count.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          ['Location searches', data.search.withLocation],
          ['Text searches', data.search.withText],
          ['Category searches', data.search.withCategory],
          ['Searches with no results', data.search.zeroResults],
          ['Results returned', data.search.resultsShown],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-neutral-200 bg-white p-4"
          >
            <p className="text-xs text-neutral-600">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
