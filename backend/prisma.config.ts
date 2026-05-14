// Prisma 7：连接 URL 仅在此配置，勿写在 schema.prisma（见 prisma/schema 校验）
import { config as loadDotenv } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";
import { defineConfig } from "prisma/config";

// 本地：monitor/backend/.env；容器：通常无文件，依赖 Docker 注入的环境变量
for (const p of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "..", ".env")]) {
  if (existsSync(p)) loadDotenv({ path: p });
}

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  throw new Error(
    "DATABASE_URL 未设置。请在环境中配置（例如 docker compose 为 backend 设置 env_file 或 environment），再执行 prisma migrate。",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url,
  },
});
