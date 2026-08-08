import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { GrcController } from './grc/grc.controller';
import { GrcService } from './grc/grc.service';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
  controllers: [GrcController],
  providers: [GrcService],
})
export class AppModule {}
