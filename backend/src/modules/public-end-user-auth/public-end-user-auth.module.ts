import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { PublicEndUserAuthController } from './public-end-user-auth.controller';
import { PublicEndUserAuthService } from './public-end-user-auth.service';

@Module({
  imports: [
    PrismaModule,
    NotificationModule,
    JwtModule.register({
      secret:
        process.env.END_USER_JWT_SECRET ||
        process.env.JWT_SECRET ||
        'dev-secret-change-me',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [PublicEndUserAuthController],
  providers: [PublicEndUserAuthService],
})
export class PublicEndUserAuthModule {}
