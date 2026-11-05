import { EventDetailSchema } from './event-detail.schema.js';
import { z } from 'zod';

export const EventSnapshotPayloadSchema = EventDetailSchema.omit({
  moderationReason: true,
  policyError: true,
  pendingStatus: true,
  pendingRegistrationStatus: true,
  pendingParticipantLimit: true,
}).extend({
  categoryName: z.string().nullable().optional(),
  previousSnapshotEventId: z.uuid().nullable().optional(),
  completedParticipantIds: z.array(z.uuid()).optional(),
  detailsChanged: z.boolean().optional(),
});

export type EventSnapshotPayload = z.infer<typeof EventSnapshotPayloadSchema>;
