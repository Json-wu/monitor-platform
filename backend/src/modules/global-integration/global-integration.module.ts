import { Module } from '@nestjs/common';
import { GlobalIntegrationSettingsService } from './global-integration-settings.service';

@Module({
  providers: [GlobalIntegrationSettingsService],
  exports: [GlobalIntegrationSettingsService],
})
export class GlobalIntegrationModule {}
