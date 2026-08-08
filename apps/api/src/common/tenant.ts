import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { AuthenticatedRequest } from '../identity/identity.types';

export const TenantId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const value = request.principal?.tenantId;
    if (!value || !isUUID(value, '4')) throw new Error('Doğrulanmış tenant context bulunamadı.');
    return value;
  },
);
