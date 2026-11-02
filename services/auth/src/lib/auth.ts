import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { jwt } from 'better-auth/plugins';
import { MailMessageCipher } from '@event-sharing/messaging';
import { env } from '../config/env.js';
import { prisma } from '../database/client.js';
import { MailRequestRepository } from '../repositories/MailRequestRepository.js';
import { AuthMailService } from '../services/AuthMailService.js';

const mail =
  env.MAIL_DELIVERY_ENABLED === 'true' && env.MAIL_ENCRYPTION_KEY
    ? new AuthMailService(
        new MailRequestRepository(),
        new MailMessageCipher(env.MAIL_ENCRYPTION_KEY),
      )
    : null;

export const accountMailAvailable = Boolean(mail);

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/auth',
  trustedOrigins: [env.FRONTEND_ORIGIN, env.BETTER_AUTH_URL],
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({ data: { ...user, image: null } }),
      },
      update: {
        before: async (user) => ({ data: { ...user, image: null } }),
      },
    },
  },
  user: {
    changeEmail: {
      enabled: accountMailAvailable,
      ...(mail
        ? {
            sendChangeEmailConfirmation: async ({
              user,
              url,
            }: {
              user: { id: string; email: string };
              url: string;
            }) => {
              await mail.queue(user.id, 'EMAIL_CONFIRMATION', user.email, url);
            },
          }
        : {}),
    },
    additionalFields: {
      role: {
        type: ['USER', 'ORGANIZER', 'ADMIN'],
        required: false,
        defaultValue: 'USER',
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    ...(mail
      ? {
          sendResetPassword: async ({
            user,
            url,
          }: {
            user: { id: string; email: string };
            url: string;
          }) => {
            await mail.queue(user.id, 'PASSWORD_RESET', user.email, url);
          },
        }
      : {}),
  },
  ...(mail
    ? {
        emailVerification: {
          sendVerificationEmail: async ({ user, url }) => {
            await mail.queue(user.id, 'EMAIL_CHANGE', user.email, url);
          },
        },
      }
    : {}),
  advanced: {
    database: {
      generateId: 'uuid',
    },
  },
  disabledPaths: ['/token'],
  plugins: [
    jwt({
      jwt: {
        issuer: env.BETTER_AUTH_URL,
        audience: env.AUTH_JWT_AUDIENCE,
        expirationTime: '5m',
        definePayload: ({ user }) => ({
          tokenUse: 'internal-user-access',
          role: user.role ?? 'USER',
        }),
      },
    }),
  ],
});
