import { z } from 'zod';
import type { Place, PlaceKind } from './place.schema';

const PhotonFeatureSchema = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z.object({
    name: z.string().optional(),
    street: z.string().optional(),
    housenumber: z.string().optional(),
    city: z.string().optional(),
    locality: z.string().optional(),
    type: z.string().optional(),
    osm_key: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    osm_type: z.string().optional(),
    osm_id: z.number().optional(),
  }),
});

const PhotonResponseSchema = z.object({
  features: z.array(PhotonFeatureSchema),
});

export class PhotonClient {
  private readonly cache = new Map<
    string,
    { items: Place[]; expiresAt: number }
  >();

  async reverse(latitude: number, longitude: number): Promise<Place | null> {
    const baseUrl = process.env.PHOTON_BASE_URL ?? 'https://photon.komoot.io';
    const url = new URL('/reverse', baseUrl);
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('limit', '5');
    url.searchParams.set('radius', '1');
    url.searchParams.set('lang', 'en');
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'EventSharing/0.1 (venue lookup)',
      },
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Address lookup is unavailable.');
    const payload = PhotonResponseSchema.parse(await response.json());
    const feature =
      payload.features.find(
        (item) =>
          item.properties.street ||
          item.properties.type === 'street' ||
          item.properties.osm_key === 'highway',
      ) ?? payload.features[0];
    if (!feature) return null;
    const place = this.toPlace(feature, 'address');
    if (
      !feature.properties.street &&
      feature.properties.type !== 'street' &&
      feature.properties.osm_key !== 'highway'
    )
      place.address = '';
    return place;
  }

  async search(query: string, kind: PlaceKind): Promise<Place[]> {
    const key = `${kind}:${query.toLowerCase()}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.items;

    const baseUrl = process.env.PHOTON_BASE_URL ?? 'https://photon.komoot.io';
    const url = new URL('/api', baseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '6');
    url.searchParams.set('lang', 'en');
    if (kind === 'city') {
      url.searchParams.append('layer', 'city');
      url.searchParams.append('layer', 'locality');
    }

    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'EventSharing/0.1 (location suggestions)',
      },
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Place suggestions are unavailable.');

    const payload = PhotonResponseSchema.parse(await response.json());
    const items = payload.features.map((feature) =>
      this.toPlace(feature, kind),
    );
    this.cache.set(key, { items, expiresAt: Date.now() + 15 * 60_000 });
    if (this.cache.size > 300)
      this.cache.delete(this.cache.keys().next().value ?? '');
    return items;
  }

  private toPlace(
    feature: z.infer<typeof PhotonFeatureSchema>,
    kind: PlaceKind,
  ): Place {
    const [longitude, latitude] = feature.geometry.coordinates;
    const properties = feature.properties;
    const city =
      properties.city ??
      properties.locality ??
      (kind === 'city' ? properties.name : undefined) ??
      null;
    const region =
      [
        ...new Set(
          [city, properties.state, properties.country].filter(Boolean),
        ),
      ].join(', ') || null;
    const street = [properties.street, properties.housenumber]
      .filter(Boolean)
      .join(' ');
    const address =
      kind === 'city'
        ? (properties.name ?? city ?? '')
        : street || properties.name || '';
    const label = [
      ...new Set(
        [address, city, properties.state, properties.country].filter(Boolean),
      ),
    ].join(', ');
    return {
      id: `${properties.osm_type ?? 'place'}:${properties.osm_id ?? `${longitude}:${latitude}`}`,
      label,
      city,
      region,
      address: label.slice(0, 300),
      latitude,
      longitude,
    };
  }
}

export const photonClient = new PhotonClient();
