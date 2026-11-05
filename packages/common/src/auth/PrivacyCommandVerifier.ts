import {
  PrivacyCommandSchema,
  type PrivacyCommand,
} from '@event-sharing/contracts';
import { jwtVerify, type JWTVerifyGetKey } from 'jose';

export class PrivacyCommandVerifier {
  constructor(
    private readonly jwks: JWTVerifyGetKey,
    private readonly issuer: string,
    private readonly audience: string,
    private readonly operation: PrivacyCommand['operation'],
  ) {}

  async verify(authorization?: string): Promise<PrivacyCommand | null> {
    const token = /^Bearer (\S+)$/.exec(authorization ?? '')?.[1];
    if (!token) return null;
    try {
      const result = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        maxTokenAge: '2 minutes',
      });
      const command = PrivacyCommandSchema.parse(result.payload);
      return command.operation === this.operation ? command : null;
    } catch {
      return null;
    }
  }
}
