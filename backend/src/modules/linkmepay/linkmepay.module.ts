import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RemoveBackgroundModule } from '../remove-background/remove-background.module';
import { GlobalIntegrationModule } from '../global-integration/global-integration.module';
import { LinkmePayService } from './linkmepay.service';
import { PublicLinkmePayController } from './public-linkmepay.controller';
import { LinkmePayWebhookController } from './linkmepay-webhook.controller';

@Module({
  imports: [PrismaModule, RemoveBackgroundModule, GlobalIntegrationModule],
  controllers: [PublicLinkmePayController, LinkmePayWebhookController],
  providers: [LinkmePayService],
  exports: [LinkmePayService],
})
export class LinkmePayModule {}
