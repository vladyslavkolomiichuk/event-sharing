import type {
  AdminOrganizerRequest,
  OrganizerRequest,
  UpdateIdentity,
  UserRole,
} from '@event-sharing/contracts';
import { gateway } from './GatewayClient';

export type SessionUser = {
  id: string;
  name: string;
  username: string | null;
  email: string;
  role: UserRole;
};

export type AuthSession = { user: SessionUser } | null;
export type SocialProvider = 'google' | 'github';
export type AccountCapabilities = {
  emailDeliveryAvailable: boolean;
  socialProviders: Record<SocialProvider, boolean>;
};

export class AuthClient {
  getSession(): Promise<AuthSession> {
    return gateway.get<AuthSession>(
      '/auth/get-session?disableCookieCache=true',
    );
  }

  signIn(email: string, password: string): Promise<unknown> {
    return gateway.post('/auth/sign-in/email', { email, password });
  }

  signUp(
    name: string,
    username: string,
    email: string,
    password: string,
  ): Promise<unknown> {
    return gateway.post('/auth/sign-up/email', {
      name,
      username,
      email,
      password,
    });
  }

  signOut(): Promise<unknown> {
    return gateway.post('/auth/sign-out');
  }

  accountCapabilities(): Promise<AccountCapabilities> {
    return gateway.get('/auth/account-capabilities');
  }

  socialAccounts(): Promise<{ providers: SocialProvider[] }> {
    return gateway.get('/auth/social-accounts');
  }

  deletionRequest(): Promise<{ status: string; requestedAt?: string }> {
    return gateway.get('/auth/privacy/deletion-request');
  }

  requestDeletion(): Promise<{ status: string; requestedAt: string }> {
    return gateway.post('/auth/privacy/deletion-request');
  }

  pendingDeletionRequests(): Promise<{
    requests: {
      id: string;
      requestedAt: string;
      user: { name: string; username: string; email: string };
    }[];
  }> {
    return gateway.get('/auth/admin/privacy-requests');
  }

  async startSocial(
    provider: SocialProvider,
    callbackURL: string,
    errorCallbackURL: string,
    link = false,
  ): Promise<string> {
    const result = await gateway.post<{ url?: string }>(
      link ? '/auth/link-social' : '/auth/sign-in/social',
      { provider, callbackURL, errorCallbackURL, disableRedirect: true },
    );
    if (!result.url) throw new Error('Could not start social sign-in.');
    return result.url;
  }

  usernameAvailable(username: string): Promise<{ available: boolean }> {
    return gateway.get(
      `/auth/username-availability?username=${encodeURIComponent(username)}`,
    );
  }

  usernameSuggestions(name: string): Promise<{ suggestions: string[] }> {
    return gateway.get(
      `/auth/username-suggestions?name=${encodeURIComponent(name)}`,
    );
  }

  changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<unknown> {
    return gateway.post('/auth/change-password', {
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
  }

  changeEmail(newEmail: string, callbackURL: string): Promise<unknown> {
    return gateway.post('/auth/change-email', { newEmail, callbackURL });
  }

  updateIdentity(
    input: UpdateIdentity,
  ): Promise<{ id: string; name: string; username: string }> {
    return gateway.patch('/auth/identity', input);
  }

  requestPasswordReset(email: string, redirectTo: string): Promise<unknown> {
    return gateway.post('/auth/request-password-reset', { email, redirectTo });
  }

  resetPassword(token: string, newPassword: string): Promise<unknown> {
    return gateway.post('/auth/reset-password', { token, newPassword });
  }

  changeRole(username: string, role: UserRole): Promise<unknown> {
    return gateway.patch(
      `/auth/admin/users/${encodeURIComponent(username)}/role`,
      { role },
    );
  }

  organizerRequest(): Promise<{ request: OrganizerRequest | null }> {
    return gateway.get('/auth/organizer-requests/me');
  }

  submitOrganizerRequest(reason: string): Promise<OrganizerRequest> {
    return gateway.post('/auth/organizer-requests', { reason });
  }

  pendingOrganizerRequests(): Promise<{
    requests: AdminOrganizerRequest[];
    total: number;
  }> {
    return gateway.get('/auth/admin/organizer-requests');
  }

  decideOrganizerRequest(
    id: string,
    decision: 'approve' | 'reject',
    decisionReason?: string,
  ): Promise<OrganizerRequest> {
    return gateway.post(`/auth/admin/organizer-requests/${id}/${decision}`, {
      decisionReason,
    });
  }
}

export const authClient = new AuthClient();
