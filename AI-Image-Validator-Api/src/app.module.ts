import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UnifiedSecurityModule } from './image-verification/image-verification.module';

@Module({
  imports: [UnifiedSecurityModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
