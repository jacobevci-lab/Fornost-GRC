import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from './database/prisma.service';
import { GrcController } from './grc/grc.controller';
import { GRC_REPOSITORY, PrismaGrcRepository } from './grc/grc.repository';
import { GrcService } from './grc/grc.service';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
  controllers: [GrcController],
  providers: [
    PrismaService,
    GrcService,
    { provide: GRC_REPOSITORY, useClass: PrismaGrcRepository },
  ],
})
export class AppModule {}
