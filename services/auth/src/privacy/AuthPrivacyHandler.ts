import {
  ServicePrivacyHandler,
  ServiceRpcError,
} from '@event-sharing/messaging';

export class AuthPrivacyHandler extends ServicePrivacyHandler {
  protected readonly collections = [
    {
      name: 'account',
      query:
        'SELECT id, name, username, email, "emailVerified", role, "createdAt", "updatedAt" FROM "user" WHERE id = $1 ORDER BY id',
    },
    {
      name: 'sessions',
      query:
        'SELECT "createdAt", "updatedAt", "expiresAt", "ipAddress", "userAgent" FROM session WHERE "userId" = $1 ORDER BY id',
    },
    {
      name: 'providers',
      query:
        'SELECT "providerId", "accountId", "createdAt" FROM account WHERE "userId" = $1 ORDER BY id',
    },
    {
      name: 'organizerRequests',
      query:
        'SELECT id, reason, status, "decisionReason", "requestedAt", "decidedAt" FROM organizer_request WHERE "userId" = $1 ORDER BY id',
    },
  ];
  protected async erase(): Promise<never> {
    throw new ServiceRpcError(
      'Auth deletion requires completed acknowledgements.',
      'FORBIDDEN',
      403,
    );
  }
}
