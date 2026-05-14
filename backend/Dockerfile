FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
# Prisma 7：generate 会加载 prisma.config.ts；构建期无真实库，占位 URL 即可
ENV DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/placeholder
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4010
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs
COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# 生产依赖 + prisma CLI（用于镜像内 prisma migrate deploy）
# 构建期占位 URL；运行时由 compose 的 environment / env_file 覆盖为真实 DATABASE_URL
ENV DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/placeholder
RUN npm ci --omit=dev && npm install prisma@7.7.0 --no-save && npx prisma generate
COPY --from=builder /app/dist ./dist
USER nestjs
EXPOSE 4010
CMD ["node", "dist/src/main.js"]
