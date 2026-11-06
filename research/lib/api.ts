import { GATEWAY_URL, ORIGIN, sql, waitUntil } from './stack.js';

export type User = {
  id: string;
  email: string;
  username: string;
  cookie: string;
};

export type ApiResponse = {
  status: number;
  // Responses are checked by status and read by known field names.
  json: any;
};

export async function call(
  user: User | null,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<ApiResponse & { cookies: string[] }> {
  const response = await fetch(`${GATEWAY_URL}${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(user ? { cookie: user.cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  return {
    status: response.status,
    json: text.startsWith('{') ? JSON.parse(text) : null,
    cookies: response.headers.getSetCookie(),
  };
}

// Sign-up allows 10 per minute per address, so each user gets its own address.
async function signUp(index: number): Promise<User> {
  const username = `load_${index}`;
  const email = `${username}@research.example.com`;
  const response = await call(
    null,
    'POST',
    '/auth/sign-up/email',
    {
      name: `Load ${index}`,
      email,
      username,
      password: 'research-strong-password-1',
    },
    { 'x-forwarded-for': `10.20.${index >> 8}.${index & 255}` },
  );
  if (response.status !== 200)
    throw new Error(`Sign-up ${index}: ${JSON.stringify(response.json)}`);
  return {
    id: response.json.user.id,
    email,
    username,
    cookie: response.cookies.map((value) => value.split(';')[0]).join('; '),
  };
}

async function inBatches<Result>(
  count: number,
  create: (index: number) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = [];
  const size = 4;
  for (let start = 0; start < count; start += size) {
    const indexes = Array.from(
      { length: Math.min(size, count - start) },
      (_, offset) => start + offset,
    );
    results.push(...(await Promise.all(indexes.map(create))));
  }
  return results;
}

export const seedUsers = (count: number, firstIndex = 0) =>
  inBatches(count, (index) => signUp(firstIndex + index));

export type Staff = { admin: User; organizer: User };

export async function seedStaff(): Promise<Staff> {
  const [admin, organizer] = await seedUsers(2, 60_000);
  if (!admin || !organizer) throw new Error('Staff were not created.');
  sql('auth_db', `UPDATE "user" SET role = 'ADMIN' WHERE id = '${admin.id}'`);
  sql(
    'auth_db',
    `UPDATE "user" SET role = 'ORGANIZER' WHERE id = '${organizer.id}'`,
  );
  return { admin, organizer };
}

// Runs the real lifecycle, so Participation learns about the event through Kafka.
async function createOpenEvent(
  { admin, organizer }: Staff,
  capacity: number,
): Promise<string> {
  const created = await call(organizer, 'POST', '/api/events', {
    title: 'Research event',
    description: 'Research event description.',
    categoryId: null,
    startTime: new Date(Date.now() + 86_400_000).toISOString(),
    endTime: new Date(Date.now() + 90_000_000).toISOString(),
    location: {
      address: 'Independence Square',
      region: 'Sumy',
      latitude: 50.9077,
      longitude: 34.7981,
      visibility: 'PUBLIC',
    },
    participantLimit: capacity,
  });
  if (created.status !== 201)
    throw new Error(`Create event: ${JSON.stringify(created.json)}`);
  const eventId: string = created.json.id;

  const steps: [User, string][] = [
    [organizer, 'submit'],
    [admin, 'approve'],
    [organizer, 'publish'],
    [organizer, 'registration/open'],
  ];
  for (const [actor, action] of steps) {
    const step = await call(
      actor,
      'POST',
      `/api/events/${eventId}/${action}`,
      {},
    );
    if (step.status >= 300)
      throw new Error(`${action}: ${JSON.stringify(step.json)}`);
    const settled = await waitUntil(
      async () => {
        const event = await call(organizer, 'GET', `/api/events/${eventId}`);
        return event.status === 200 && !event.json.pendingStatus;
      },
      30_000,
      100,
    );
    if (!settled) throw new Error(`${action} did not settle.`);
  }

  const open = await waitUntil(
    () =>
      sql(
        'participation_db',
        `SELECT 1 FROM registration_policy WHERE "eventId" = '${eventId}' AND status = 'OPEN'`,
      ).length === 1,
    30_000,
  );
  if (!open) throw new Error(`Registration did not open for ${eventId}.`);
  return eventId;
}

export const seedEvents = (staff: Staff, count: number, capacity: number) =>
  inBatches(count, () => createOpenEvent(staff, capacity));
