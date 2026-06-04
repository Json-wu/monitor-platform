# 构建基础镜像可通过 --build-arg NODE_IMAGE=... 覆盖（默认 node:20-alpine）
# 例：crpi-g5p50ww96ven4gi1.cn-shanghai.personal.cr.aliyuncs.com/lucyx/node:22-bookworm-slim
ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY scripts/docker-npm-ci.sh ./scripts/docker-npm-ci.sh
RUN chmod +x ./scripts/docker-npm-ci.sh && ./scripts/docker-npm-ci.sh
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
# Prisma 7：generate 会加载 prisma.config.ts；构建期无真实库，占位 URL 即可
ENV DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/placeholder
RUN npx prisma generate && npm run build \
 && npx tsc prisma/seed.ts \
      --target ES2022 --module CommonJS \
      --esModuleInterop --skipLibCheck --resolveJsonModule \
      --outDir dist

ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4010
RUN if command -v apk >/dev/null 2>&1; then \
      addgroup --system --gid 1001 nodejs \
      && adduser --system --uid 1001 --ingroup nodejs nestjs; \
    else \
      groupadd --system --gid 1001 nodejs \
      && useradd --system --uid 1001 --gid nodejs nestjs \
      && apt-get update -y \
      && apt-get install -y --no-install-recommends openssl ca-certificates \
      && rm -rf /var/lib/apt/lists/*; \
    fi
COPY package.json package-lock.json* ./
COPY scripts/docker-npm-ci.sh ./scripts/docker-npm-ci.sh
COPY prisma ./prisma
COPY prisma.config.ts ./
# 生产依赖 + prisma CLI（用于镜像内 prisma migrate deploy）
# 构建期占位 URL；运行时由 compose 的 environment / env_file 覆盖为真实 DATABASE_URL
ENV DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/placeholder
RUN chmod +x ./scripts/docker-npm-ci.sh && ./scripts/docker-npm-ci.sh --omit=dev \
  && npm install prisma@7.7.0 --no-save \
  && npx prisma generate
COPY --from=builder /app/dist ./dist
USER nestjs
EXPOSE 4010
CMD ["node", "dist/src/main.js"]
