import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RemoveBackgroundModule } from '../remove-background/remove-background.module';
import { ClientActivityService } from './client-activity.service';
import { ClientActivityController } from './client-activity.controller';
import { PublicClientActivityController } from './public-client-activity.controller';

@Module({
  imports: [PrismaModule, RemoveBackgroundModule],
  controllers: [ClientActivityController, PublicClientActivityController],
  providers: [ClientActivityService],
  exports: [ClientActivityService],
})
export class ClientActivityModule {}
