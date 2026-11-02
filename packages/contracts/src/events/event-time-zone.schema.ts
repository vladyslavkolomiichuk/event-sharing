import { z } from 'zod';

export const EventTimeZoneSchema = z
  .string()
  .min(1)
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, 'Use a valid IANA time zone.');
