import { Module } from '@nestjs/common';
import { GlobalIntegrationModule } from '../global-integration/global-integration.module';
import { RemoveBackgroundModule } from '../remove-background/remove-background.module';
import { KlingImageService } from './kling-image.service';
import { PublicKlingImageController } from './public-kling-image.controller';

@Module({
  imports: [GlobalIntegrationModule, RemoveBackgroundModule],
  controllers: [PublicKlingImageController],
  providers: [KlingImageService],
  exports: [KlingImageService],
})
export class KlingImageModule {}
