import {
  InternalUserJwtClaimsSchema,
  type InternalUserJwtClaims,
} from '@event-sharing/contracts';
import { jwtVerify, type JWTVerifyGetKey } from 'jose';

export type InternalJwtSettings = {
  jwks: JWTVerifyGetKey;
  issuer: string;
  audience: string;
};

export class InternalJwtVerifier {
  constructor(private readonly settings: InternalJwtSettings) {}

  async verify(
    authorization?: string | null,
  ): Promise<InternalUserJwtClaims | null> {
    const token = /^Bearer (\S+)$/.exec(authorization ?? '')?.[1];
    if (!token) return null;

    try {
      const verified = await jwtVerify(token, this.settings.jwks, {
        issuer: this.settings.issuer,
        audience: this.settings.audience,
      });
      return InternalUserJwtClaimsSchema.parse(verified.payload);
    } catch {
      return null;
    }
  }
}
