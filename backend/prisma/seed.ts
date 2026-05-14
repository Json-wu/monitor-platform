import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/monitor?schema=public',
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'super_admin' },
    update: {
      permissions: {
        apps: ['view', 'create', 'edit', 'delete'],
        users: ['view', 'create', 'edit', 'delete'],
        credits: ['view', 'create', 'edit'],
        orders: ['view', 'edit', 'refund'],
        pricing: ['view', 'create', 'edit', 'delete'],
        audit: ['view', 'export'],
        analytics: ['view', 'export'],
        notifications: ['view', 'create', 'edit', 'delete'],
        quotas: ['view', 'edit'],
        config: ['view', 'edit'],
        system_logs: ['view'],
        admins: ['view', 'create', 'edit', 'delete'],
        roles: ['view', 'create', 'edit', 'delete'],
      },
    },
    create: {
      name: 'super_admin',
      displayName: 'Super Admin',
      isSystem: true,
      permissions: {
        apps: ['view', 'create', 'edit', 'delete'],
        users: ['view', 'create', 'edit', 'delete'],
        credits: ['view', 'create', 'edit'],
        orders: ['view', 'edit', 'refund'],
        pricing: ['view', 'create', 'edit', 'delete'],
        audit: ['view', 'export'],
        analytics: ['view', 'export'],
        notifications: ['view', 'create', 'edit', 'delete'],
        quotas: ['view', 'edit'],
        config: ['view', 'edit'],
        system_logs: ['view'],
        admins: ['view', 'create', 'edit', 'delete'],
        roles: ['view', 'create', 'edit', 'delete'],
      },
    },
  });

  await prisma.role.upsert({
    where: { name: 'app_admin' },
    update: {},
    create: {
      name: 'app_admin',
      displayName: 'App Admin',
      isSystem: true,
      permissions: {
        apps: ['view', 'edit'],
        users: ['view', 'create', 'edit', 'delete'],
        credits: ['view', 'create', 'edit'],
        orders: ['view', 'edit', 'refund'],
        pricing: ['view', 'create', 'edit', 'delete'],
        audit: ['view'],
        analytics: ['view'],
        notifications: ['view', 'create', 'edit'],
        quotas: ['view', 'edit'],
      },
    },
  });

  await prisma.role.upsert({
    where: { name: 'operator' },
    update: {},
    create: {
      name: 'operator',
      displayName: 'Operator',
      isSystem: true,
      permissions: {
        users: ['view', 'edit'],
        credits: ['view', 'create'],
        orders: ['view'],
        audit: ['view'],
        analytics: ['view'],
      },
    },
  });

  await prisma.role.upsert({
    where: { name: 'finance' },
    update: {},
    create: {
      name: 'finance',
      displayName: 'Finance',
      isSystem: true,
      permissions: {
        orders: ['view', 'refund'],
        analytics: ['view', 'export'],
        audit: ['view'],
      },
    },
  });

  await prisma.role.upsert({
    where: { name: 'viewer' },
    update: {},
    create: {
      name: 'viewer',
      displayName: 'Viewer',
      isSystem: true,
      permissions: {
        apps: ['view'],
        users: ['view'],
        credits: ['view'],
        orders: ['view'],
        analytics: ['view'],
        audit: ['view'],
      },
    },
  });

  const passwordHash = await bcrypt.hash('admin123', 10);
  await prisma.adminUser.upsert({
    where: { email: 'admin@monitor.local' },
    update: {},
    create: {
      email: 'admin@monitor.local',
      name: 'Super Admin',
      passwordHash,
      roleId: superAdminRole.id,
    },
  });

  /** 每个应用默认一条「注册邮箱验证码」模板（slug 固定，可在后台修改正文） */
  const apps = await prisma.application.findMany({
    select: { id: true, name: true },
  });
  const verifySlug = 'register_email_verification';
  for (const app of apps) {
    await prisma.notificationTemplate.upsert({
      where: {
        appId_slug: { appId: app.id, slug: verifySlug },
      },
      create: {
        appId: app.id,
        name: '注册邮箱验证码',
        slug: verifySlug,
        channel: 'email',
        subject: '{{appName}} 邮箱验证码',
        body: `<p>您好，</p>
<p>您的验证码为 <strong style="font-size:18px;letter-spacing:0.2em;">{{code}}</strong></p>
<p>请在 <strong>{{expiryMinutes}}</strong> 分钟内完成验证。</p>
<p style="color:#888;font-size:12px;">收件邮箱：{{email}}</p>
<p style="color:#888;font-size:12px;">如非本人操作请忽略本邮件。</p>
<p>—— {{appName}}</p>`,
        variables: ['code', 'email', 'appName', 'expiryMinutes'] as unknown as Prisma.InputJsonValue,
        isActive: true,
      },
      update: {},
    });
  }
  if (apps.length) {
    console.log(
      `Seed: ensured "${verifySlug}" email template for ${apps.length} application(s).`,
    );
  }

  console.log(
    'Seed completed: 5 roles + 1 super admin (admin@monitor.local / admin123)',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
