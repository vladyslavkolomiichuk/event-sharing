import { z } from 'zod';

export const SearchModeSchema = z.enum(['DEVICE', 'CITY', 'ANYWHERE']);
export type SearchMode = z.infer<typeof SearchModeSchema>;
export const SearchLocationSourceSchema = SearchModeSchema.exclude([
  'ANYWHERE',
]);

export const SearchPreferenceSchema = z.strictObject({
  mode: z.union([SearchModeSchema, z.literal('UNSET')]),
});
export type SearchPreference = z.infer<typeof SearchPreferenceSchema>;

export const UpdateSearchPreferenceSchema = z.strictObject({
  mode: SearchModeSchema,
});
export type UpdateSearchPreference = z.infer<
  typeof UpdateSearchPreferenceSchema
>;
