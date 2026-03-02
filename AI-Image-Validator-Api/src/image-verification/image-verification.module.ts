import { Module } from '@nestjs/common';
import { UnifiedSecurityController } from './security.controller';
import { UnifiedSecurityService } from './unified-security.service';

@Module({
  controllers: [UnifiedSecurityController],
  providers: [UnifiedSecurityService],
  exports: [UnifiedSecurityService],
})
export class UnifiedSecurityModule {}