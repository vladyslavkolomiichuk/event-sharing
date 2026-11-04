import {
  PlaceReverseResponseSchema,
  PlaceSearchResponseSchema,
  type Place,
  type PlaceKind,
} from '@/lib/places/place.schema';

export class PlacesClient {
  async reverse(
    latitude: number,
    longitude: number,
    signal?: AbortSignal,
  ): Promise<Place | null> {
    const response = await fetch('/places/reverse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ latitude, longitude }),
      signal,
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error('Address lookup is unavailable.');
    return PlaceReverseResponseSchema.parse(body).place;
  }

  async search(
    query: string,
    kind: PlaceKind,
    signal?: AbortSignal,
  ): Promise<Place[]> {
    const params = new URLSearchParams({ query, kind });
    const response = await fetch(`/places/search?${params}`, { signal });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = body as { message?: string } | null;
      throw new Error(error?.message ?? 'Place suggestions are unavailable.');
    }
    return PlaceSearchResponseSchema.parse(body).items;
  }
}

export const placesClient = new PlacesClient();
