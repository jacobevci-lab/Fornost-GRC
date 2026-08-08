export interface VerifiedToken {
  issuer: string;
  subject: string;
}

export interface AuthenticatedPrincipal extends VerifiedToken {
  userId: string;
  tenantId: string;
  permissions: string[];
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  principal?: AuthenticatedPrincipal;
}

export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');
