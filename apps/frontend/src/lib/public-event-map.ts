import type { SearchEvent } from '@event-sharing/contracts';

export type PublicMapEvent = SearchEvent & {
  mapPoint: { latitude: number; longitude: number };
};

const roundedCoordinate = (value: number) => Math.round(value * 100) / 100;

export function selectPublicMapEvents(
  events: SearchEvent[],
  limit = 100,
): PublicMapEvent[] {
  limit = Math.min(100, Math.max(0, Math.floor(limit)));
  if (!limit) return [];
  const cells = new Map<string, PublicMapEvent[]>();
  const positions = new Set<string>();

  for (const event of events) {
    const { latitude, longitude, visibility } = event.location;
    if (
      visibility !== 'PUBLIC' ||
      latitude === null ||
      longitude === null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180 ||
      !['PUBLISHED', 'ONGOING'].includes(event.status)
    )
      continue;

    const mapPoint = {
      latitude: roundedCoordinate(latitude),
      longitude: roundedCoordinate(longitude),
    };
    const positionKey = `${mapPoint.latitude}:${mapPoint.longitude}`;
    if (positions.has(positionKey)) continue;
    positions.add(positionKey);

    const cell = `${Math.floor((latitude + 90) / 5)}:${Math.floor((longitude + 180) / 5)}`;
    const bucket = cells.get(cell) ?? [];
    if (bucket.length >= 8) continue;
    bucket.push({ ...event, mapPoint });
    cells.set(cell, bucket);
  }

  const selected: PublicMapEvent[] = [];
  const buckets = [...cells.values()];
  for (let index = 0; selected.length < limit; index++) {
    let found = false;
    for (const bucket of buckets) {
      const event = bucket[index];
      if (!event) continue;
      selected.push(event);
      found = true;
      if (selected.length === limit) break;
    }
    if (!found) break;
  }
  return selected;
}
