import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GlobalIntegrationModule } from '../global-integration/global-integration.module';
import { SystemOperationLogModule } from '../system-log/system-operation-log.module';
import { AinewsModule } from '../ainews/ainews.module';
import { GumroadService } from './gumroad.service';
import { GumroadWebhookController } from './gumroad-webhook.controller';

@Module({
  imports: [PrismaModule, GlobalIntegrationModule, SystemOperationLogModule, AinewsModule],
  controllers: [GumroadWebhookController],
  providers: [GumroadService],
  exports: [GumroadService],
})
export class GumroadModule {}
