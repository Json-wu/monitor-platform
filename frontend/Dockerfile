# 管理后台（如 clearbgwatch.*）— Next.js standalone
# 构建基础镜像可通过 --build-arg NODE_IMAGE=... 覆盖（默认 node:20-alpine）
ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_BASE_URL=https://clearbgapi.testlucy.com
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

RUN npm run build

ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
# 与 docker-compose.prod.yml 中 admin 服务 PORT / 映射一致
ENV PORT=3011
RUN if command -v apk >/dev/null 2>&1; then \
      addgroup --system --gid 1001 nodejs \
      && adduser --system --uid 1001 --ingroup nodejs nextjs; \
    else \
      groupadd --system --gid 1001 nodejs \
      && useradd --system --uid 1001 --gid nodejs nextjs; \
    fi
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3011
CMD ["node", "server.js"]
