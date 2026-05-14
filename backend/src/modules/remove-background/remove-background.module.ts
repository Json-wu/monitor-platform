import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CreditModule } from '../credit/credit.module';
import { GlobalIntegrationModule } from '../global-integration/global-integration.module';
import { RemoveBackgroundService } from './remove-background.service';
import { V1ClearbgController } from './v1-clearbg.controller';

@Module({
  imports: [PrismaModule, CreditModule, GlobalIntegrationModule],
  controllers: [V1ClearbgController],
  providers: [RemoveBackgroundService],
  exports: [RemoveBackgroundService],
})
export class RemoveBackgroundModule {}
