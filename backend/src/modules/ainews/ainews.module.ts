import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { AinewsAccountService } from './ainews-account.service';
import { AinewsAnonService } from './ainews-anon.service';
import { AinewsCleanupService } from './ainews-cleanup.service';
import { AinewsDigestService } from './ainews-digest.service';
import { AinewsGumroadSubscriptionService } from './ainews-gumroad-subscription.service';
import { AinewsIngestService } from './ainews-ingest.service';
import { AinewsIngestSummarizeService } from './ainews-ingest-summarize.service';
import { AinewsNewsService } from './ainews-news.service';
import { AinewsSchedulerService } from './ainews-scheduler.service';
import { AinewsPreferencesService } from './ainews-preferences.service';
import { AinewsSummarizeService } from './ainews-summarize.service';
import { AinewsTrackService } from './ainews-track.service';
import { PublicAinewsController } from './public-ainews.controller';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret:
        process.env.END_USER_JWT_SECRET ||
        process.env.JWT_SECRET ||
        'dev-secret-change-me',
    }),
  ],
  controllers: [PublicAinewsController],
  providers: [
    AinewsAccountService,
    AinewsAnonService,
    AinewsNewsService,
    AinewsTrackService,
    AinewsSummarizeService,
    AinewsPreferencesService,
    AinewsGumroadSubscriptionService,
    AinewsIngestService,
    AinewsIngestSummarizeService,
    AinewsDigestService,
    AinewsCleanupService,
    AinewsSchedulerService,
  ],
  exports: [AinewsGumroadSubscriptionService, AinewsAccountService],
})
export class AinewsModule {}
