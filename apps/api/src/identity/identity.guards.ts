import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdentityService } from './identity.service';
import { IS_PUBLIC, REQUIRED_PERMISSIONS } from './identity.decorators';
import type { AuthenticatedRequest } from './identity.types';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.principal = await this.identity.authenticate(
      this.firstHeader(request.headers.authorization),
      this.firstHeader(request.headers['x-tenant-id']),
    );
    return true;
  }

  private firstHeader(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [context.getHandler(), context.getClass()]);
    const granted = context.switchToHttp().getRequest<AuthenticatedRequest>().principal?.permissions ?? [];
    if (!required?.length || (!granted.includes('*') && !required.every((permission) => granted.includes(permission)))) {
      throw new ForbiddenException('Bu işlem için yetkiniz bulunmuyor.');
    }
    return true;
  }
}
