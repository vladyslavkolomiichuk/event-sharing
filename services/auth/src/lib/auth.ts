import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { jwt } from 'better-auth/plugins';
import { MailMessageCipher } from '@event-sharing/messaging';
import { DisplayNameSchema, UsernameSchema } from '@event-sharing/contracts';
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
export const socialProvidersAvailable = {
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
};

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_PUBLIC_URL,
  trustedOrigins: [env.FRONTEND_ORIGIN, env.BETTER_AUTH_URL],
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      allowDifferentEmails: false,
    },
  },
  socialProviders: {
    ...(socialProvidersAvailable.google
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID!,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : {}),
    ...(socialProvidersAvailable.github
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID!,
            clientSecret: env.GITHUB_CLIENT_SECRET!,
          },
        }
      : {}),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: {
            ...user,
            name: DisplayNameSchema.parse(user.name),
            ...(user.username
              ? { username: UsernameSchema.parse(user.username) }
              : {}),
            image: null,
          },
        }),
      },
      update: {
        before: async (user) => ({
          data: {
            ...user,
            ...(user.name !== undefined
              ? { name: DisplayNameSchema.parse(user.name) }
              : {}),
            image: null,
          },
        }),
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
      username: {
        type: 'string',
        required: false,
        input: false,
      },
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
