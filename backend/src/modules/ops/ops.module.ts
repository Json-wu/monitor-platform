import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { OpsController } from './ops.controller';
import { OpsJobTracker } from './ops-job-tracker.service';
import { OpsRuntimeRegistry } from './ops-runtime.registry';
import { OpsService } from './ops.service';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [OpsController],
  providers: [OpsJobTracker, OpsRuntimeRegistry, OpsService],
  exports: [OpsJobTracker, OpsRuntimeRegistry],
})
export class OpsModule {}
