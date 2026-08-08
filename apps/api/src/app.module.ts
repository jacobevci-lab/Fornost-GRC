import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from './database/prisma.service';
import { GrcController } from './grc/grc.controller';
import { GRC_REPOSITORY, PrismaGrcRepository } from './grc/grc.repository';
import { GrcService } from './grc/grc.service';
import { AuthenticationGuard, AuthorizationGuard } from './identity/identity.guards';
import { IdentityService } from './identity/identity.service';
import { OidcTokenVerifier } from './identity/oidc-token-verifier';
import { TOKEN_VERIFIER } from './identity/identity.types';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
  controllers: [GrcController],
  providers: [
    PrismaService,
    IdentityService,
    { provide: TOKEN_VERIFIER, useClass: OidcTokenVerifier },
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: AuthorizationGuard },
    GrcService,
    { provide: GRC_REPOSITORY, useClass: PrismaGrcRepository },
  ],
})
export class AppModule {}
