import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'identity:public';
export const REQUIRED_PERMISSIONS = 'identity:permissions';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
