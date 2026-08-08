import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createPublicKey, verify as verifySignature } from 'node:crypto';
import type { JsonWebKey as NodeJsonWebKey } from 'node:crypto';
import type { VerifiedToken } from './identity.types';

interface JwtHeader { alg?: string; kid?: string }
interface JwtPayload { aud?: string | string[]; exp?: number; iss?: string; nbf?: number; sub?: string }
type OidcJsonWebKey = NodeJsonWebKey & { kid?: string };
interface JsonWebKeySet { keys?: OidcJsonWebKey[] }

@Injectable()
export class OidcTokenVerifier {
  private cachedKeys?: { expiresAt: number; keys: OidcJsonWebKey[] };

  async verify(token: string): Promise<VerifiedToken> {
    try {
      const issuer = this.required('OIDC_ISSUER').replace(/\/$/, '');
      const audience = this.required('OIDC_AUDIENCE');
      const [encodedHeader, encodedPayload, encodedSignature, extra] = token.split('.');
      if (!encodedHeader || !encodedPayload || !encodedSignature || extra) throw new Error('malformed JWT');
      const header = this.decode<JwtHeader>(encodedHeader);
      const payload = this.decode<JwtPayload>(encodedPayload);
      if (header.alg !== 'RS256' || !header.kid || !payload.sub) throw new Error('unsupported JWT');
      const now = Math.floor(Date.now() / 1000);
      const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (payload.iss?.replace(/\/$/, '') !== issuer || !audiences.includes(audience)) throw new Error('claim mismatch');
      if (!payload.exp || payload.exp <= now || (payload.nbf && payload.nbf > now)) throw new Error('invalid token time');
      const key = (await this.keys()).find((candidate) => candidate.kid === header.kid && candidate.kty === 'RSA');
      if (!key) throw new Error('signing key not found');
      const valid = verifySignature(
        'RSA-SHA256',
        Buffer.from(`${encodedHeader}.${encodedPayload}`),
        createPublicKey({ key, format: 'jwk' }),
        Buffer.from(encodedSignature, 'base64url'),
      );
      if (!valid) throw new Error('invalid signature');
      return { issuer, subject: payload.sub };
    } catch {
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş erişim belirteci.');
    }
  }

  private decode<T>(value: string): T {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  }

  private async keys(): Promise<OidcJsonWebKey[]> {
    if (this.cachedKeys && this.cachedKeys.expiresAt > Date.now()) return this.cachedKeys.keys;
    const issuer = this.required('OIDC_ISSUER').replace(/\/$/, '');
    const response = await fetch(process.env.OIDC_JWKS_URI ?? `${issuer}/.well-known/jwks.json`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('JWKS unavailable');
    const body = (await response.json()) as JsonWebKeySet;
    if (!Array.isArray(body.keys)) throw new Error('invalid JWKS');
    this.cachedKeys = { keys: body.keys, expiresAt: Date.now() + 5 * 60_000 };
    return body.keys;
  }

  private required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} yapılandırması zorunludur.`);
    return value;
  }
}
