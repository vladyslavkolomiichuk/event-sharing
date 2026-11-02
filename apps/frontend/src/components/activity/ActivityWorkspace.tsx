'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EVENT_TYPES,
  type EventLogAnalytics,
  type EventLogEntry,
  type UserProfilePublic,
} from '@event-sharing/contracts';
import { eventLogClient } from '@/lib/api/EventLogClient';
import { usersClient } from '@/lib/api/UsersClient';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/feedback/Loading';
import { AnalyticsOverview } from './AnalyticsOverview';
import { ActivityTrend } from './ActivityTrend';
import { CategoryActivity } from './CategoryActivity';
import { ConsumerProgress } from './ConsumerProgress';
import { EventStatusActivity } from './EventStatusActivity';
import { ActivityFeed } from './ActivityFeed';

export function ActivityWorkspace() {
  const { show } = useToast();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [eventType, setEventType] = useState('');
  const [producer, setProducer] = useState('');
  const [analytics, setAnalytics] = useState<EventLogAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [items, setItems] = useState<EventLogEntry[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfilePublic>>(
    {},
  );
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestId = useRef(0);

  const load = useCallback(
    async (next?: string) => {
      const current = ++requestId.current;
      setLoading(true);
      setHistoryFailed(false);
      try {
        const from = new Date();
        from.setUTCHours(0, 0, 0, 0);
        from.setUTCDate(from.getUTCDate() - days + 1);
        const page = await eventLogClient.entries({
          eventType: eventType || undefined,
          producer: producer || undefined,
          from: from.toISOString(),
          cursor: next,
          limit: 30,
        });
        if (current !== requestId.current) return;
        setItems((previous) =>
          next ? [...previous, ...page.items] : page.items,
        );
        setCursor(page.nextCursor);
        const userIds = page.items.flatMap((item) =>
          item.subjectUserId ? [item.subjectUserId] : [],
        );
        if (userIds.length) {
          usersClient
            .getMany(userIds)
            .then((results) => {
              if (current !== requestId.current) return;
              setProfiles((previous) => ({
                ...previous,
                ...Object.fromEntries(
                  results.map((profile) => [profile.userId, profile]),
                ),
              }));
            })
            .catch(() => show('Profile names could not load.', 'warning'));
        }
      } catch (cause) {
        if (current === requestId.current) {
          setHistoryFailed(true);
          show(
            cause instanceof Error
              ? cause.message
              : 'Could not load event history.',
            'error',
          );
        }
      } finally {
        if (current === requestId.current) setLoading(false);
      }
    },
    [days, eventType, producer, show],
  );

  useEffect(() => {
    let cancelled = false;
    setAnalytics(null);
    setAnalyticsLoading(true);
    eventLogClient
      .analytics(days)
      .then((data) => {
        if (!cancelled) setAnalytics(data);
      })
      .catch((cause) => {
        if (!cancelled)
          show(
            cause instanceof Error
              ? cause.message
              : 'Could not load analytics.',
            'error',
          );
      })
      .finally(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, refreshKey, show]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load();
    return () => {
      requestId.current++;
    };
  }, [load, refreshKey]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4">
        <div>
          <label htmlFor="activity-days">Period</label>
          <select
            id="activity-days"
            value={days}
            onChange={(event) =>
              setDays(Number(event.target.value) as 7 | 30 | 90)
            }
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
        <div>
          <label htmlFor="activity-type">Event type</label>
          <select
            id="activity-type"
            value={eventType}
            onChange={(event) => setEventType(event.target.value)}
          >
            <option value="">All types</option>
            {Object.values(EVENT_TYPES).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="activity-producer">Service</label>
          <select
            id="activity-producer"
            value={producer}
            onChange={(event) => setProducer(event.target.value)}
          >
            <option value="">All services</option>
            {[
              'auth',
              'users',
              'events',
              'participation',
              'geo-search',
              'notifications',
            ].map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>
      {analytics ? (
        <>
          <AnalyticsOverview data={analytics} />
          <div className="grid gap-4 lg:grid-cols-2">
            <ActivityTrend data={analytics} />
            <CategoryActivity data={analytics} />
          </div>
          <ConsumerProgress data={analytics} />
          <EventStatusActivity data={analytics} />
        </>
      ) : analyticsLoading ? (
        <Loading label="Loading analytics…" />
      ) : (
        <p className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600">
          Analytics are unavailable. Refresh to try again.
        </p>
      )}
      <ActivityFeed
        items={items}
        profiles={profiles}
        nextCursor={cursor}
        loading={loading}
        failed={historyFailed}
        onLoadMore={() => cursor && void load(cursor)}
      />
      <p className="text-xs text-neutral-600">
        Counts reflect events received during the selected period and may
        briefly lag the source services. Event Log stores selected domain
        metadata only; it does not track page views, IP addresses, session
        secrets, or precise search coordinates.
      </p>
    </div>
  );
}
