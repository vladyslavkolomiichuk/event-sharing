import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './mocks.js';

vi.mock('../src/database/client.js', () => import('./mocks.js'));

const { auth, accountMailAvailable, socialProvidersAvailable } =
  await import('../src/lib/auth.js');
const hooks = (auth.options as any).databaseHooks;

beforeEach(() => prisma.reset());

describe('Better Auth configuration', () => {
  it('disables mail and social sign-in without settings', () => {
    expect(accountMailAvailable).toBe(false);
    expect(socialProvidersAvailable).toEqual({ google: false, github: false });
    expect((auth.options as any).disabledPaths).toContain('/token');
  });

  it('requires a valid username for email sign-up', async () => {
    const create = hooks.user.create.before;
    await expect(
      create({ name: 'Iryna', email: 'a@b.test' }, { path: '/sign-up/email' }),
    ).rejects.toThrow('Choose a username.');
    await expect(
      create({ name: 'Iryna', username: 'admin' }, { path: '/sign-up/email' }),
    ).rejects.toThrow();
    const created = await create(
      { name: ' Iryna ', username: 'Iryna_M', image: 'x' },
      { path: '/sign-up/email' },
    );
    expect(created.data).toMatchObject({
      name: 'Iryna',
      username: 'iryna_m',
      image: null,
    });
  });

  it('leaves social users without a username', async () => {
    const created = await hooks.user.create.before(
      { name: 'Iryna', username: 'ignored' },
      { path: '/callback/github' },
    );
    expect(created.data.username).toBeNull();
  });

  it('validates name and username updates', async () => {
    const update = hooks.user.update.before;
    expect((await update({ name: 'Olena' })).data).toEqual({
      name: 'Olena',
      image: null,
    });
    await expect(update({ username: '1bad' })).rejects.toThrow();
  });

  it('blocks new sessions during account deletion', async () => {
    const create = hooks.session.create.before;
    prisma.privacyDeletionJob.findFirst.mockResolvedValueOnce(null);
    expect((await create({ userId: 'u1' })).data).toEqual({ userId: 'u1' });
    prisma.privacyDeletionJob.findFirst.mockResolvedValueOnce({
      requestId: 'r1',
    });
    await expect(create({ userId: 'u1' })).rejects.toThrow(
      'Account deletion is in progress.',
    );
  });
});
