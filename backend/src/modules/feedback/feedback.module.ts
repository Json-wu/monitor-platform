import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RemoveBackgroundModule } from '../remove-background/remove-background.module';
import { FeedbackService } from './feedback.service';
import { FeedbackController } from './feedback.controller';
import { PublicFeedbackController } from './public-feedback.controller';

@Module({
  imports: [PrismaModule, RemoveBackgroundModule],
  controllers: [FeedbackController, PublicFeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
