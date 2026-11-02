import { z } from 'zod';

export const RegistrationStatusSchema = z.enum(['OPEN', 'CLOSED', 'FULL']);

export type RegistrationStatus = z.infer<typeof RegistrationStatusSchema>;
