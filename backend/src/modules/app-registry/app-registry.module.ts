import { Module } from '@nestjs/common';
import { AppRegistryService } from './app-registry.service';
import { AppRegistryController } from './app-registry.controller';
import { GlobalIntegrationModule } from '../global-integration/global-integration.module';
import { KlingImageModule } from '../kling-image/kling-image.module';
import { ReplicateModule } from '../replicate/replicate.module';
import { TuringRoomDecorationModule } from '../turing-room-decoration/turing-room-decoration.module';

@Module({
  imports: [
    GlobalIntegrationModule,
    KlingImageModule,
    ReplicateModule,
    TuringRoomDecorationModule,
  ],
  controllers: [AppRegistryController],
  providers: [AppRegistryService],
  exports: [AppRegistryService],
})
export class AppRegistryModule {}
