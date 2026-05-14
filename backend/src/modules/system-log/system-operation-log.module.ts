import { Module } from '@nestjs/common';
import { SystemOperationLogService } from './system-operation-log.service';
import { SystemOperationLogController } from './system-operation-log.controller';

@Module({
  controllers: [SystemOperationLogController],
  providers: [SystemOperationLogService],
  exports: [SystemOperationLogService],
})
export class SystemOperationLogModule {}
