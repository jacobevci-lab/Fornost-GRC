export const DEFAULT_TENANT_ID = '11111111-1111-4111-8111-111111111111';

export type TenantContext = Readonly<{ tenantId: string; userId?: string; correlationId: string }>;
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Status = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  correlationId: string;
  details?: unknown;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
