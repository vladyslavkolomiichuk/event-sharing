import type { UpdateIdentity, UserRole } from '@event-sharing/contracts';
import { gateway } from './GatewayClient';

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
};

export type AuthSession = { user: SessionUser } | null;
export type AccountCapabilities = { emailDeliveryAvailable: boolean };

export class AuthClient {
  getSession(): Promise<AuthSession> {
    return gateway.get<AuthSession>('/auth/get-session');
  }

  signIn(email: string, password: string): Promise<unknown> {
    return gateway.post('/auth/sign-in/email', { email, password });
  }

  signUp(name: string, email: string, password: string): Promise<unknown> {
    return gateway.post('/auth/sign-up/email', { name, email, password });
  }

  signOut(): Promise<unknown> {
    return gateway.post('/auth/sign-out');
  }

  accountCapabilities(): Promise<AccountCapabilities> {
    return gateway.get('/auth/account-capabilities');
  }

  usernameAvailable(username: string): Promise<{ available: boolean }> {
    return gateway.get(
      `/auth/username-availability?username=${encodeURIComponent(username)}`,
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
}

export const authClient = new AuthClient();
