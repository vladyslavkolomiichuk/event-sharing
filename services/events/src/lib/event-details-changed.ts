import type { Event } from '../generated/prisma/client.js';

export function eventDetailsChanged(before: Event, after: Event): boolean {
  return (
    before.title !== after.title ||
    before.description !== after.description ||
    before.startTime.getTime() !== after.startTime.getTime() ||
    before.endTime.getTime() !== after.endTime.getTime() ||
    before.timeZone !== after.timeZone ||
    before.locationAddress !== after.locationAddress ||
    before.locationRegion !== after.locationRegion ||
    Number(before.latitude) !== Number(after.latitude) ||
    Number(before.longitude) !== Number(after.longitude)
  );
}
