// EXP-03: GiST against sequential scan on the query used by SearchRepository.
import { call, seedUsers } from '../lib/api.js';
import { runLoad, type LoadRequest } from '../lib/load.js';
import { round, saveTable, seededRandom, stats } from '../lib/report.js';
import { count, isFinal, resetStack, sql } from '../lib/stack.js';

const DATABASE = 'geo_search_db';
const SIZES = isFinal ? [10_000, 100_000, 500_000] : [10_000, 100_000];
const RADII_KM = [1, 5, 20, 100];
const ORIGINS = isFinal ? 200 : 20;
const REPEATS = isFinal ? 3 : 2;
const CORRECTNESS_ORIGINS = 10;
const EARTH_RADIUS_M = 6371008.7714;
const INDEX_NAME = 'event_projection_location_gist';

// Regional centres of Ukraine, used by the urban distribution.
const CITIES = [
  [50.45, 30.52],
  [49.84, 24.03],
  [49.99, 36.23],
  [46.48, 30.72],
  [48.46, 35.04],
  [47.91, 33.39],
  [48.62, 22.3],
  [50.91, 34.8],
  [51.5, 31.29],
  [49.59, 34.55],
  [49.23, 28.47],
  [50.25, 28.66],
  [50.62, 26.25],
  [50.75, 25.33],
  [48.92, 24.71],
  [49.55, 25.59],
  [48.29, 25.94],
  [49.42, 26.99],
  [49.44, 32.06],
  [48.51, 32.26],
  [46.97, 31.99],
  [46.64, 32.61],
  [47.84, 35.14],
];

const DISTRIBUTIONS: Record<string, { latitude: string; longitude: string }> = {
  uniform: {
    latitude: '45 + random() * 7',
    longitude: '23 + random() * 16',
  },
  urban: {
    latitude: 'cities.latitude + random_normal(0, 0.1)',
    longitude: 'cities.longitude + random_normal(0, 0.15)',
  },
};

function loadEvents(distribution: string, size: number): void {
  const { latitude, longitude } = DISTRIBUTIONS[distribution]!;
  const cities = CITIES.map(([lat, lon]) => `(${lat}, ${lon})`).join(',');
  sql(
    DATABASE,
    `TRUNCATE event_projection;
     SELECT setseed(0.42);
     INSERT INTO event_projection (
       id, "organizerId", title, description, "startTime", "endTime", status,
       visibility, latitude, longitude, version, "updatedAt"
     )
     SELECT gen_random_uuid(), gen_random_uuid(), 'Event ' || g, 'Description',
       NOW() + interval '1 day', NOW() + interval '2 days', 'PUBLISHED',
       'PUBLIC', ${latitude}, ${longitude}, 1, NOW()
     FROM generate_series(1, ${size}) g
     CROSS JOIN LATERAL (
       SELECT latitude, longitude
       FROM (VALUES ${cities}) AS c(latitude, longitude)
       WHERE g IS NOT NULL
       ORDER BY random() LIMIT 1
     ) cities;
     ANALYZE event_projection;`,
  );
}

type Origin = { latitude: number; longitude: number };

// Each distribution searches where its events are, with one fixed seed.
function originsFor(distribution: string): Origin[] {
  const random = seededRandom(7);
  return Array.from({ length: ORIGINS }, () => {
    if (distribution === 'uniform')
      return { latitude: 45 + random() * 7, longitude: 23 + random() * 16 };
    const [latitude = 0, longitude = 0] =
      CITIES[Math.floor(random() * CITIES.length)] ?? [];
    return {
      latitude: latitude + (random() - 0.5) * 0.2,
      longitude: longitude + (random() - 0.5) * 0.3,
    };
  });
}

const point = ({ latitude, longitude }: Origin) =>
  `ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`;

const inRadius = (origin: Origin, meters: number) =>
  `ST_DWithin(p.location, ${point(origin)}, ${meters}::double precision, false)`;

const VISIBLE = `p.status IN ('PUBLISHED', 'ONGOING') AND p."endTime" > NOW() AND p."eventVisibility" = 'PUBLIC'`;

// Same shape as SearchRepository with sort=distance and a page of 20.
const searchQuery = (origin: Origin, meters: number) => `
  WITH matches AS (
    SELECT p.id, p."organizerId", p."categoryId", p."categoryName",
      p.title, p.description, p."startTime", p."endTime", p."timeZone", p.status,
      p.region, p.visibility, p.address, p.latitude, p.longitude,
      ST_Distance(p.location, ${point(origin)}, false) AS "distanceMeters", 0 AS rank
    FROM "event_projection" p
    WHERE ${VISIBLE} AND ${inRadius(origin, meters)}
  )
  SELECT * FROM matches m
  ORDER BY m."distanceMeters" ASC, m."startTime" ASC, m.id ASC
  LIMIT 21`;

type ExplainResult = {
  'Execution Time': number;
  JIT?: unknown;
};

// One session runs all queries, and the first pass only warms the cache.
function measureLatency(origins: Origin[], meters: number) {
  const queries = origins
    .map(
      (origin) =>
        `EXPLAIN (ANALYZE, TIMING OFF, FORMAT JSON) ${searchQuery(origin, meters)};`,
    )
    .join('\n');
  const passes: {
    executionMs: number;
    usedJit: boolean;
    usedIndex: boolean;
  }[][] = [];
  for (let pass = 0; pass <= REPEATS; pass += 1) {
    const output = sql(DATABASE, queries)
      .map((row) => row.join('|'))
      .join('\n');
    const plans = JSON.parse(`[${output.replace(/\]\n\[/g, '],[')}]`);
    passes.push(
      plans.map((plan: [ExplainResult]) => ({
        executionMs: plan[0]['Execution Time'],
        usedJit: plan[0].JIT !== undefined,
        usedIndex: JSON.stringify(plan).includes(INDEX_NAME),
      })),
    );
  }
  const measured = passes.slice(1).flat();
  return {
    latency: stats(measured.map((row) => row.executionMs)),
    usedJitPercent:
      (100 * measured.filter((row) => row.usedJit).length) / measured.length,
    usedIndexPercent:
      (100 * measured.filter((row) => row.usedIndex).length) / measured.length,
  };
}

const resultFingerprints = (origins: Origin[], meters: number) =>
  origins.slice(0, CORRECTNESS_ORIGINS).map((origin) => {
    const [row] = sql(
      DATABASE,
      `SELECT count(*), md5(string_agg(p.id::text, ',' ORDER BY p.id))
       FROM event_projection p WHERE ${VISIBLE} AND ${inRadius(origin, meters)}`,
    );
    return { found: Number(row?.[0] ?? 0), hash: row?.[1] ?? '' };
  });

// Independent great-circle formula, so PostGIS is not checked against itself.
function referenceCheck(origins: Origin[], meters: number) {
  const totals = { truePositive: 0, falsePositive: 0, falseNegative: 0 };
  for (const origin of origins.slice(0, CORRECTNESS_ORIGINS)) {
    const [row] = sql(
      DATABASE,
      `WITH checked AS (
         SELECT ${inRadius(origin, meters)} AS found,
           2 * ${EARTH_RADIUS_M} * asin(sqrt(
             sin(radians(p.latitude - ${origin.latitude}) / 2) ^ 2
             + cos(radians(${origin.latitude})) * cos(radians(p.latitude))
             * sin(radians(p.longitude - ${origin.longitude}) / 2) ^ 2
           )) <= ${meters} AS expected
         FROM event_projection p WHERE ${VISIBLE}
       )
       SELECT count(*) FILTER (WHERE found AND expected),
         count(*) FILTER (WHERE found AND NOT expected),
         count(*) FILTER (WHERE expected AND NOT found)
       FROM checked`,
    );
    totals.truePositive += Number(row?.[0] ?? 0);
    totals.falsePositive += Number(row?.[1] ?? 0);
    totals.falseNegative += Number(row?.[2] ?? 0);
  }
  return totals;
}

// With no matches there is nothing to score, which differs from a zero score.
const percent = (part: number, total: number) =>
  total === 0 ? 'n/a' : round((100 * part) / total, 3);

export async function run(): Promise<void> {
  await resetStack();
  const rows = [];
  for (const distribution of Object.keys(DISTRIBUTIONS)) {
    const origins = originsFor(distribution);
    for (const size of SIZES) {
      loadEvents(distribution, size);
      for (const radius of RADII_KM) {
        const meters = radius * 1000;
        const indexed = measureLatency(origins, meters);
        const indexedResults = resultFingerprints(origins, meters);
        const reference = referenceCheck(origins, meters);

        sql(DATABASE, `DROP INDEX ${INDEX_NAME}; ANALYZE event_projection;`);
        const scanned = measureLatency(origins, meters);
        const scannedResults = resultFingerprints(origins, meters);
        sql(
          DATABASE,
          `CREATE INDEX ${INDEX_NAME} ON event_projection USING GIST (location);
           ANALYZE event_projection;`,
        );

        const sameResults = indexedResults.every(
          (result, index) => result.hash === scannedResults[index]?.hash,
        );
        const found = stats(indexedResults.map((result) => result.found)).mean;
        const { truePositive, falsePositive, falseNegative } = reference;
        for (const [mode, result] of [
          ['gist', indexed],
          ['no index', scanned],
        ] as const) {
          rows.push({
            distribution,
            events: size,
            radiusKm: radius,
            mode,
            p50Ms: round(result.latency.p50, 2),
            p95Ms: round(result.latency.p95, 2),
            usedJitPercent: round(result.usedJitPercent, 0),
            usedIndexPercent: round(result.usedIndexPercent, 0),
            foundMean: round(found),
            sameResults,
            precisionPercent: percent(
              truePositive,
              truePositive + falsePositive,
            ),
            recallPercent: percent(truePositive, truePositive + falseNegative),
          });
        }
        console.info(`${distribution} ${size} ${radius} km done.`);
      }
    }
  }
  saveTable('exp-03', 'geo-search', rows);
}

const API_EVENTS = isFinal ? 100_000 : 10_000;
const API_REQUESTS = isFinal ? 5_000 : 1_000;
const API_VUS = 20;

// The same search through Gateway, with session check and search.performed event.
export async function runApi(): Promise<void> {
  await resetStack();
  const users = await seedUsers(API_VUS);
  for (const user of users)
    await call(user, 'PUT', '/api/search/preference', { mode: 'CITY' });
  const rows = [];
  for (const distribution of Object.keys(DISTRIBUTIONS)) {
    loadEvents(distribution, API_EVENTS);
    const origins = originsFor(distribution);
    for (const radius of RADII_KM) {
      const requests = Array.from(
        { length: API_REQUESTS },
        (_, index): LoadRequest => ({
          method: 'POST',
          path: '/api/search/events',
          body: JSON.stringify({
            ...origins[index % origins.length],
            radiusMeters: radius * 1000,
            locationSource: 'CITY',
            sort: 'distance',
            limit: 20,
          }),
          cookie: users[index % users.length]!.cookie,
        }),
      );
      const load = await runLoad(requests, { vus: API_VUS });
      rows.push({
        distribution,
        events: API_EVENTS,
        radiusKm: radius,
        httpP50: round(load.httpP50),
        httpP95: round(load.httpP95),
        requestsPerSecond: round(load.requestsPerSecond),
        accepted: load.accepted,
        rejected: load.rejected,
        failed: load.failed,
        failedStatuses: load.failedStatuses,
        pendingSearchEvents: count(
          DATABASE,
          'SELECT count(*) FROM outbox_event WHERE "publishedAt" IS NULL',
        ),
      });
    }
  }
  saveTable('exp-03', 'geo-search-api', rows);
}
