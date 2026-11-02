import { createRemoteJWKSet } from 'jose';
import { env } from './env.js';

export const internalJwks = createRemoteJWKSet(new URL(env.AUTH_JWKS_URL));
