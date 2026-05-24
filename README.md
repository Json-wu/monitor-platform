# Monitor 管理后台

本仓库为 **ClearBG / Monitor 运营与管控平台** 的独立工程，仅包含 **管理后台 Web 前端** 与 **后端 API**，用于多应用接入、计费与积分、订单、角色权限、集成能力配置及对外网关能力等场景。

## 项目功能概览

### 管理后台前端（`frontend/`）

基于 **Next.js** 的管理控制台，典型能力包括：

- **工作台与多应用切换**：按应用维度查看数据与配置。
- **用户与积分**：终端用户、积分流水、额度与策略相关管理。
- **订单与定价**：订单列表、定价方案与预览等运营配置。
- **应用与密钥**：应用注册、API Key / 对接标识等。
- **系统设置**：管理员、角色权限、SMTP、各类 **第三方与 AI 集成**（如抠图/ClearBG 上游、Replicate、可灵图片、支付等，以实际环境变量与后端模块为准）。
- **日志与通知**：操作日志、系统日志、通知等辅助运营能力。

前端默认开发端口为 **3002**；生产镜像内默认监听 **3011**（见 `frontend/Dockerfile`）。

### 后端 API（`backend/`）

基于 **NestJS** 与 **Prisma（PostgreSQL）** 的服务，全局路由前缀为 **`/api`**，主要方向包括：

- **管理员认证与权限**：后台登录、JWT、角色与资源控制。
- **应用注册与对外网关**：面向终端或合作方的 **应用 slug**（如请求头 `X-App-Slug`）、用户侧 API Key（`X-Api-Key`）等鉴权与计费链路。
- **积分、订单、定价、分析**：与前台产品线对应的计费与运营数据接口。
- **集成模块**：抠图/ClearBG 代理、Replicate、可灵、支付回调等（随部署启用的环境变量与模块而定）。
- **审计与系统日志**：关键操作留痕、运维查询。

默认开发端口为 **4000**（可通过环境变量 `PORT` 覆盖）；生产镜像内默认 **4010**（见 `backend/Dockerfile`）。

### 技术栈摘要

| 部分     | 技术 |
|----------|------|
| 管理前端 | Next.js、React、TypeScript、Tailwind CSS |
| 后端     | NestJS、Prisma、PostgreSQL |
| 容器     | Docker（多阶段构建），可选推送阿里云 ACR |

## 目录结构

```
monitor-platform/
├── frontend/          # 管理后台 Next.js
├── backend/           # NestJS + Prisma API
├── deploy/
│   └── acr.env.example   # 构建推送 ACR 的环境变量示例
├── scripts/
│   └── build-push.sh     # 本地构建并推送镜像
├── build-acr.sh       # 调用 scripts/build-push.sh 的便捷入口
├── docker-compose.yml # 可选：本机一键 Postgres + 后端 + 前端（占用内存较大）
└── README.md
```

## 本地开发

### 环境要求

- **Node.js** ≥ 20  
- **PostgreSQL** ≥ 15（或与 Prisma 配置兼容的版本）  
- 根目录分别在 `frontend/`、`backend/` 下安装依赖并配置环境变量。

### 数据库与 Prisma

1. 准备可用的 `DATABASE_URL`（PostgreSQL 连接串）。  
2. 在 `backend/` 目录执行迁移与客户端生成，例如：

```bash
cd backend
npm install
npx prisma migrate deploy   # 或开发阶段使用 prisma migrate dev
npx prisma generate
```

具体以仓库内 `prisma` 目录与团队约定为准。

### 启动后端

```bash
cd backend
npm install
npm run start:dev
```

默认 API 根地址形如：`http://localhost:4000/api`（若修改了 `PORT`，请替换端口）。

### 启动管理前端

```bash
cd frontend
npm install
npm run dev
```

浏览器访问开发地址（默认 **http://localhost:3002**）。请将前端使用的 **后端公网或本机 API 地址** 配置为与 `NEXT_PUBLIC_*` 或项目内 `api` 封装一致（以代码与环境变量为准）。

### CORS 与后台域名

后端会合并 `CORS_ORIGINS`、`FRONTEND_URL`、`ADMIN_ORIGIN` 等环境变量作为允许来源；生产环境请务必配置为实际的管理后台与业务前端域名，避免浏览器跨域被拦截。

---

## 部署说明

**推荐路径（省本机内存、不在本机跑全栈）**：不要在本机长期跑数据库与整套 Node 服务，也不要在内存紧张时使用根目录 `docker compose up --build`。只在本机（或 CI 机器）用 Docker **构建镜像并推送到阿里云 ACR**，再在 ACK / ASK / ECS 等环境拉镜像运行。镜像构建仍会占用一定内存；若本机仍吃紧，可把同一套 `Dockerfile` 与 `deploy/acr.env` 放到 **GitHub Actions、云效、ACR 镜像构建** 等云端执行。

### 1. 构建并推送到阿里云 ACR

1. 复制环境变量模板并填写命名空间、线上 API 地址等：

```bash
cp deploy/acr.env.example deploy/acr.env
# 编辑 deploy/acr.env：ACR_REGISTRY、IMAGE_TAG、NEXT_PUBLIC_API_BASE_URL、可选 ACR_USERNAME / ACR_PASSWORD
```

2. **`NEXT_PUBLIC_API_BASE_URL`**：填写 **用户浏览器能访问到的后端根地址**（无末尾斜杠，不要手写 `/api`，前端代码会自动拼上）。须与将来 Ingress / SLB 上的 Monitor API 域名一致。

3. **登录 ACR**（任选其一）：

- 在 `deploy/acr.env` 中配置 `ACR_USERNAME` 与 `ACR_PASSWORD`，执行脚本时会自动 `docker login`；或  
- 先手动执行：`docker login registry.<地域>.aliyuncs.com`（使用控制台或 RAM 凭证）。

4. **构建并推送**（可只跑其中一条，不必一次 `all`；内存仍紧张时可先后执行 `frontend` 与 `backend` 两次，或改在 CI / 云端构建同一 `Dockerfile`）：

```bash
# 仅前端镜像
sh build-acr.sh frontend

# 仅后端镜像
sh build-acr.sh backend

# 前后端依次构建并推送（最常用）
sh build-acr.sh all
```

常用选项：

- **`--no-push`**：只生成本地镜像，不推送到 ACR。  
- **`--no-login`**：已手动 `docker login` 时使用。  

指定其它 env 文件：

```bash
ENV_FILE=/path/to/custom.env sh scripts/build-push.sh all
```

#### 1.1 GitHub Actions 自动构建并推送（推荐）

仓库已内置 `.github/workflows/build-push-acr.yml`：

- **触发**：推送到 `main` 时按改动路径自动构建（仅 `frontend/**` 改动只构前端，`backend/**` 改动只构后端，二者都改则并行）；也可在 Actions 页 **Run workflow** 手动指定 `frontend / backend / all` 与 tag。
- **缓存**：使用 `type=gha` Buildx 缓存，第二次起的 `npm ci` / 编译层基本走缓存，远快于本地。
- **产物 tag**：每次推送两个 tag —— 输入 tag（默认 `latest`）+ `sha-<short>`，便于回滚。

**首次启用前**在 GitHub 仓库 `Settings → Secrets and variables → Actions` 配置：

| 类型 | 名称 | 说明 |
|------|------|------|
| Secret | `ACR_USERNAME` | 阿里云 ACR 登录用户名（建议 RAM 子账号） |
| Secret | `ACR_PASSWORD` | 对应的 ACR 访问密码 / 临时密码 |
| Variable | `ACR_REGISTRY` | 完整命名空间路径，例：`registry.cn-hangzhou.aliyuncs.com/your-namespace` |
| Variable | `NEXT_PUBLIC_API_BASE_URL` | 浏览器访问后端的根地址（无末尾斜杠） |
| Variable（可选） | `FRONTEND_IMAGE_NAME` | 默认 `monitor-admin-frontend` |
| Variable（可选） | `BACKEND_IMAGE_NAME` | 默认 `monitor-admin-backend` |

推送完成后，在目标环境拉取镜像，配置 **端口**（前端容器 **3011**，后端 **4010**）、**健康检查**、**运行时环境变量**（如 `DATABASE_URL`、`JWT_SECRET`、`ADMIN_ORIGIN` 等），并在首次部署或发版时对后端执行 **`prisma migrate deploy`**。

### 2. 镜像说明（自行 docker build 时）

前后端各自包含 `Dockerfile`，构建上下文分别为 `frontend/` 与 `backend/`。

- **前端**：Next.js **standalone**，容器内默认端口 **3011**。  
- **后端**：Nest 编译产物 + Prisma；容器内默认端口 **4010**。  

运行时通过编排平台注入 **`DATABASE_URL`** 及业务密钥，**勿**把生产密钥写进镜像层。

### 3. 可选：本地 Docker Compose（占用资源大）

根目录 `docker-compose.yml` 会在本机同时起 Postgres、后端、前端并 **构建镜像**，内存与 CPU 占用明显，**本机内存紧张时请不要用**。

若仍需要本机一键联调，在仓库根目录执行：

```bash
docker compose up --build
```

访问 **http://localhost:3011**（管理端）、**http://localhost:4000**（API）、**localhost:5432**（数据库）。与 `backend/docker-compose.yml` 不要同时占用 **5432**。详见 `docker-compose.yml` 内注释。

---

## 许可证

若子目录或依赖包含单独许可证声明，以相应文件为准；未单独声明时，以原上游仓库约定为准。
