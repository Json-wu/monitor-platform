import { Module } from '@nestjs/common';
import { GlobalIntegrationModule } from '../global-integration/global-integration.module';
import { RemoveBackgroundModule } from '../remove-background/remove-background.module';
import { ReplicateService } from './replicate.service';
import { V1ColorizeController } from './v1-colorize.controller';
import { V1InpaintingController } from './v1-inpainting.controller';
import { V1OnblurController } from './v1-onblur.controller';
import { V1ProHeadshotController } from './v1-pro-headshot.controller';

@Module({
  imports: [GlobalIntegrationModule, RemoveBackgroundModule],
  controllers: [V1ColorizeController, V1OnblurController, V1InpaintingController, V1ProHeadshotController],
  providers: [ReplicateService],
  exports: [ReplicateService],
})
export class ReplicateModule {}
