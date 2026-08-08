import { BadRequestException, Injectable, createParamDecorator } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { isUUID } from 'class-validator';

export const TenantId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const value = context.switchToHttp().getRequest<{ headers: Record<string, string> }>().headers[
      'x-tenant-id'
    ];
    if (!value || !isUUID(value, '4'))
      throw new BadRequestException('Geçerli x-tenant-id başlığı zorunludur.');
    return value;
  },
);

@Injectable()
export class AuthorizationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    void context;
    // Foundation hook: production implementation verified identity + permission policy kullanmalıdır.
    return true;
  }
}
