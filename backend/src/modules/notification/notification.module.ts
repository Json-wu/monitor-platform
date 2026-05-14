import { Module } from '@nestjs/common';
import { GlobalIntegrationModule } from '../global-integration/global-integration.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [GlobalIntegrationModule],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
