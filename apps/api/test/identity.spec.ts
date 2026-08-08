import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationGuard } from '../src/identity/identity.guards';
import { IdentityService } from '../src/identity/identity.service';
import type { AuthenticatedRequest } from '../src/identity/identity.types';

afterEach(() => {
  delete process.env.AUTH_DEV_BYPASS;
  process.env.NODE_ENV = 'test';
});

describe('IdentityService', () => {
  it('rejects requests without a bearer token', async () => {
    const verifier = { verify: vi.fn() };
    const prisma = { withTenant: vi.fn() };
    const service = new IdentityService(verifier, prisma as never);
    await expect(service.authenticate()).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('derives tenant and permissions from the verified membership', async () => {
    const verifier = {
      verify: vi.fn().mockResolvedValue({ issuer: 'issuer', subject: 'subject' }),
    };
    const findMany = vi.fn().mockResolvedValue([
      {
        user: {
          id: 'user-id',
          tenantId: '11111111-1111-4111-8111-111111111111',
          roles: [{ role: { permissions: ['grc:read'] } }],
        },
      },
    ]);
    const prisma = {
      withTenant: vi.fn((_tenantId, work) => work({ userIdentity: { findMany } })),
      userIdentity: {
        findMany,
      },
    };
    const service = new IdentityService(verifier, prisma as never);
    const principal = await service.authenticate(
      'Bearer signed-token',
      '11111111-1111-4111-8111-111111111111',
    );
    expect(principal.tenantId).toBe('11111111-1111-4111-8111-111111111111');
    expect(principal.permissions).toEqual(['grc:read']);
  });

  it('requires an explicit tenant selector before membership lookup', async () => {
    const verifier = {
      verify: vi.fn().mockResolvedValue({ issuer: 'issuer', subject: 'subject' }),
    };
    const prisma = { withTenant: vi.fn() };
    const service = new IdentityService(verifier, prisma as never);

    await expect(service.authenticate('Bearer signed-token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.withTenant).not.toHaveBeenCalled();
  });

  it('rejects an unverified tenant selector', async () => {
    const verifier = {
      verify: vi.fn().mockResolvedValue({ issuer: 'issuer', subject: 'subject' }),
    };
    const prisma = {
      withTenant: vi.fn((_tenantId, work) =>
        work({ userIdentity: { findMany: vi.fn().mockResolvedValue([]) } }),
      ),
    };
    const service = new IdentityService(verifier, prisma as never);
    await expect(
      service.authenticate('Bearer signed-token', '11111111-1111-4111-8111-111111111111'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AuthorizationGuard', () => {
  it('denies endpoints without an explicit permission policy', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(undefined),
    };
    const guard = new AuthorizationGuard(reflector as unknown as Reflector);
    const request = { principal: { permissions: ['*'] } } as unknown as AuthenticatedRequest;
    const context = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({ getRequest: () => request }),
    };
    expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
  });

  it('requires every declared permission', () => {
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(['grc:read', 'risk:write']),
    };
    const guard = new AuthorizationGuard(reflector as unknown as Reflector);
    const request = { principal: { permissions: ['grc:read'] } } as unknown as AuthenticatedRequest;
    const context = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({ getRequest: () => request }),
    };
    expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
  });
});
