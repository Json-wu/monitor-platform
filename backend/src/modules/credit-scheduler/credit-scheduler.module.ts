import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CreditSchedulerService } from './credit-scheduler.service';

@Module({
  imports: [PrismaModule],
  providers: [CreditSchedulerService],
})
export class CreditSchedulerModule {}
