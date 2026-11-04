import { z } from 'zod';

export const DataExportSourceSchema = z.enum([
  'auth',
  'profile',
  'events',
  'participation',
  'searchPreference',
  'messages',
  'storage',
  'notifications',
  'eventLog',
]);

export const DataExportResponseSchema = z.strictObject({
  exportedAt: z.iso.datetime(),
  userId: z.uuid(),
  complete: z.boolean(),
  requestedSources: z.array(DataExportSourceSchema),
  failedSources: z.array(DataExportSourceSchema),
  data: z.partialRecord(DataExportSourceSchema, z.unknown()),
});

export type DataExportSource = z.infer<typeof DataExportSourceSchema>;
export type DataExportResponse = z.infer<typeof DataExportResponseSchema>;
