/**
 * 将 name 为 ClearBG.ai 的应用的 slug 更新为 clearbg（与营销站 APP_SLUG 等对齐）。
 *
 * 本地（有 devDependencies / ts-node）：
 *   npm run prisma:update-clearbg-slug
 *
 * 生产 Docker 镜像内无 ts-node，请用纯 SQL + Prisma CLI（镜像内已含 prisma）：
 *   npm run prisma:update-clearbg-slug:sql
 * 或：npx prisma db execute --file prisma/scripts/update-clearbg-slug.sql
 *
 * 亦可用 psql 执行同目录下的 update-clearbg-slug.sql。
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const NAME = 'ClearBG.ai';
const NEW_SLUG = 'clearbg';

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/monitor?schema=public',
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const app = await prisma.application.findFirst({
    where: { name: NAME },
    select: { id: true, name: true, slug: true },
  });

  if (!app) {
    console.error(`未找到 name="${NAME}" 的应用，已退出。`);
    process.exit(1);
  }

  if (app.slug === NEW_SLUG) {
    console.log(`无需更新：slug 已是 "${NEW_SLUG}"（id=${app.id}）。`);
    return;
  }

  const taken = await prisma.application.findUnique({
    where: { slug: NEW_SLUG },
    select: { id: true, name: true },
  });
  if (taken && taken.id !== app.id) {
    console.error(
      `slug "${NEW_SLUG}" 已被其它应用占用（id=${taken.id}, name=${taken.name}），请先处理冲突。`,
    );
    process.exit(1);
  }

  await prisma.application.update({
    where: { id: app.id },
    data: { slug: NEW_SLUG },
  });

  console.log(
    `已更新：name="${app.name}" slug "${app.slug}" → "${NEW_SLUG}"（id=${app.id}）`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
