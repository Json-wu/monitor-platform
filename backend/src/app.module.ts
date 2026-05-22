import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './common/mail/mail.module';
import { AuthModule } from './modules/auth/auth.module';
import { AppRegistryModule } from './modules/app-registry/app-registry.module';
import { UserModule } from './modules/user/user.module';
import { AuditModule } from './modules/audit/audit.module';
import { CreditModule } from './modules/credit/credit.module';
import { OrderModule } from './modules/order/order.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AdminModule } from './modules/admin/admin.module';
import { RoleModule } from './modules/role/role.module';
import { SystemOperationLogModule } from './modules/system-log/system-operation-log.module';
import { RemoveBackgroundModule } from './modules/remove-background/remove-background.module';
import { ClientActivityModule } from './modules/client-activity/client-activity.module';
import { PublicEndUserAuthModule } from './modules/public-end-user-auth/public-end-user-auth.module';
import { LinkmePayModule } from './modules/linkmepay/linkmepay.module';
import { GumroadModule } from './modules/gumroad/gumroad.module';
import { CreditSchedulerModule } from './modules/credit-scheduler/credit-scheduler.module';
import { GlobalIntegrationModule } from './modules/global-integration/global-integration.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RbacGuard } from './common/guards/rbac.guard';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MailModule,
    PrismaModule,
    GlobalIntegrationModule,
    AuthModule,
    AppRegistryModule,
    UserModule,
    AuditModule,
    CreditModule,
    OrderModule,
    PricingModule,
    AnalyticsModule,
    NotificationModule,
    AdminModule,
    RoleModule,
    SystemOperationLogModule,
    RemoveBackgroundModule,
    ClientActivityModule,
    PublicEndUserAuthModule,
    LinkmePayModule,
    GumroadModule,
    CreditSchedulerModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
  ],
})
export class AppModule {}
