import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { TOKEN_VERIFIER } from './identity.types';
import type { AuthenticatedPrincipal, VerifiedToken } from './identity.types';

interface TokenVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

@Injectable()
export class IdentityService {
  constructor(
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async authenticate(
    authorization?: string,
    requestedTenantId?: string,
  ): Promise<AuthenticatedPrincipal> {
    if (process.env.AUTH_DEV_BYPASS === 'true') return this.devPrincipal(requestedTenantId);
    const token = this.bearer(authorization);
    const verified = await this.verifier.verify(token);
    if (!requestedTenantId || !isUUID(requestedTenantId, '4')) {
      throw new ForbiddenException('Tenant üyeliği doğrulanamadı.');
    }

    const identities = await this.prisma.withTenant(requestedTenantId, (tx) =>
      tx.userIdentity.findMany({
        where: {
          issuer: verified.issuer,
          subject: verified.subject,
          user: {
            deletedAt: null,
            tenant: { deletedAt: null },
            tenantId: requestedTenantId,
          },
        },
        include: { user: { include: { roles: { include: { role: true } } } } },
        take: 2,
      }),
    );
    if (identities.length !== 1) throw new ForbiddenException('Tenant üyeliği doğrulanamadı.');
    const [identity] = identities;
    if (!identity) throw new ForbiddenException('Tenant üyeliği doğrulanamadı.');
    const user = identity.user;
    const permissions = user.roles.flatMap(({ role }) => this.permissions(role.permissions));
    return {
      ...verified,
      userId: user.id,
      tenantId: user.tenantId,
      permissions: [...new Set(permissions)],
    };
  }

  private bearer(value?: string): string {
    const match = value?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException('Bearer erişim belirteci zorunludur.');
    const token = match[1];
    if (!token) throw new UnauthorizedException('Bearer erişim belirteci zorunludur.');
    return token;
  }

  private permissions(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private devPrincipal(tenantId?: string): AuthenticatedPrincipal {
    if (process.env.NODE_ENV === 'production')
      throw new Error('AUTH_DEV_BYPASS production ortamında kullanılamaz.');
    if (!tenantId || !isUUID(tenantId, '4'))
      throw new ForbiddenException('Geçerli pilot tenant başlığı zorunludur.');
    return {
      issuer: 'development',
      subject: 'local-pilot',
      userId: 'development',
      tenantId,
      permissions: ['*'],
    };
  }
}
