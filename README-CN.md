# Clash Config Manager

基于 Cloudflare Workers 的 Clash YAML 配置文件管理系统，附带 Web 后台管理面板。

**公开地址**：`https://example.com` — 返回最新的 YAML 配置文件，附带自定义响应头。

**管理后台**：`https://example.com/admin` — 在线编辑 YAML、版本控制、自定义响应头管理。

## 架构

```
单个 Cloudflare Worker
├── GET /              → 返回 YAML 配置（公开访问，附带 KV 中的自定义响应头）
├── GET /download      → 以文件下载方式返回 YAML 配置
├── POST /api/auth/*   → 认证接口（无需 Token）
├── /api/*             → 受保护 API（需 JWT Bearer Token）
├── GET /admin*        → 静态资源（管理后台 SPA）
└── catch-all          → env.ASSETS.fetch() 回退
```

**存储**：Cloudflare KV，存储配置版本、当前指针和自定义响应头。

**认证**：JWT（HMAC-SHA256），7 天有效期。使用密码登录 → 获取 JWT Token。

## 功能特性

- **在线 YAML 编辑器** — CodeMirror 6，支持 YAML 语法高亮与实时校验
- **版本控制** — 每次保存生成不可变版本快照，包含 ULID、内容哈希和时间戳
- **差异对比** — 选择任意两个版本进行 unified diff 差异对比
- **一键回滚** — 回滚操作会基于旧内容创建新版本（永不删除历史记录）
- **自定义响应头** — 在后台配置 `Cache-Control`、`X-Custom-Header` 等响应头
- **JWT 认证** — HMAC-SHA256 签名 Token，7 天有效期
- **草稿自动保存** — 编辑器内容每 30 秒自动保存到 localStorage
- **暗色主题** — 基于 CSS 自定义属性的完整暗色 UI
- **移动端适配** — 桌面端与移动端均可正常使用

## 快速开始

### 环境要求

- Node.js 18+

### 1. 克隆并安装依赖

```bash
git clone <repo-url> clash-config-manager
cd clash-config-manager
npm install
```

### 2. 创建 KV 命名空间

```bash
npx wrangler kv namespace create "CONFIG_KV"
```

将返回的命名空间 ID 填入 `wrangler.toml` 中的 `[[kv_namespaces]]` 的 `id` 字段。

### 3. 配置密钥

复制 `.dev.vars` 并填入本地开发用的值：

```bash
cp .dev.vars .dev.vars.local
```

设置生产环境密钥：

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put TOKEN_SECRET
```

`TOKEN_SECRET` 应至少为 32 位随机字符串。

### 4. 本地开发

分别在两个终端启动 Worker 和管理后台开发服务器：

```bash
# 终端 1：Worker API
npm run dev

# 终端 2：管理后台（支持 HMR 热更新）
npm run dev:admin
```

- Worker API：http://localhost:8787
- 管理后台：http://localhost:5173（自动将 `/api/*` 请求代理到 Worker）

### 5. 部署

```bash
npm run deploy
```

### 6. 绑定自定义域名

在 `wrangler.toml` 或 Cloudflare 控制台中添加自定义域名：

```toml
routes = [
  { pattern = "c.example.com/*", zone_name = "example.com" }
]
```

或通过 Cloudflare 控制台 → Workers → 你的 Worker → Settings → Domains & Routes 配置。

## API 参考

| 方法 | 路径 | 认证 | 请求体 | 响应 |
|------|------|------|--------|------|
| POST | /api/auth/login | 否 | `{ password }` | `{ token, expiresAt }` |
| POST | /api/auth/verify | 否 | `{ token }` | `{ valid, expiresAt }` |
| GET | /api/config | 是 | — | `{ content, versionId, updatedAt }` |
| PUT | /api/config | 是 | `{ content, message? }` | `{ versionId, contentHash, createdAt }` |
| GET | /api/versions?limit&cursor | 是 | — | `{ keys: [...], cursor? }` |
| GET | /api/versions/:id | 是 | — | `{ id, content, message, createdAt, contentHash }` |
| POST | /api/versions/:id/rollback | 是 | — | `{ versionId, contentHash, createdAt }` |
| GET | /api/headers | 是 | — | `{ "Header-Name": "value" }` |
| PUT | /api/headers | 是 | `{ "Header-Name": "value" }` | `{ ...headers }` |
| GET | / | 否 | — | YAML 文本（Content-Type: text/yaml） |
| GET | /download | 否 | — | YAML 文件下载 |

认证方式：请求头 `Authorization: Bearer <token>`。Token 无效或过期返回 401。

## 项目结构

```
clash-config-manager/
├── wrangler.toml              # Worker 配置（KV、静态资源、密钥）
├── package.json               # 项目依赖（Worker + 管理后台）
├── tsconfig.json              # Worker TypeScript 配置
├── shared/
│   └── types.ts               # 共享类型（VersionSnapshot、HeadersConfig 等）
├── src/
│   ├── index.ts               # Worker 入口（应用初始化、路由挂载）
│   ├── auth.ts                # JWT 生成/验证（Web Crypto HMAC-SHA256）
│   ├── storage.ts             # KV 存储层（ULID、SHA-256、版本 CRUD）
│   ├── types.ts               # 重新导出共享类型 + 后端专用类型/配置
│   ├── routes/
│   │   ├── auth.ts            # /api/auth/* 路由（登录、验证、登出）
│   │   ├── config.ts          # /api/config 路由（GET、PUT）
│   │   ├── versions.ts        # /api/versions/* 路由（列表、获取、回滚、更新备注）
│   │   ├── headers.ts         # /api/headers 路由（GET、PUT）
│   │   └── public.ts          # GET / 和 /download 公开端点
│   ├── middleware/
│   │   └── auth.ts            # JWT 认证守卫中间件
│   └── utils/
│       └── response.ts        # 共享工具函数（safeParseJson、createYamlResponse、setAuthCookies）
├── admin/
│   ├── vite.config.ts         # Vite 配置（代理、构建、@shared 别名）
│   ├── tsconfig.json          # 管理后台 TypeScript 配置
│   ├── index.html             # SPA 入口
│   └── src/
│       ├── main.ts            # 应用外壳 + Hash 路由 + 页面生命周期
│       ├── page.ts            # Page 接口（mount/unmount/isDirty）
│       ├── api.ts             # 类型化 API 客户端
│       ├── auth.ts            # Token 管理（内存 + Cookie）
│       ├── i18n.ts            # 国际化加载器
│       ├── locales/
│       │   └── zh-CN.ts       # 中文翻译
│       ├── login.ts           # 登录页面
│       ├── editor.ts          # CodeMirror 6 YAML 编辑器页面
│       ├── versions.ts        # 版本列表 + 差异对比 + 回滚页面
│       ├── headers.ts         # 自定义响应头编辑页面
│       ├── modal.ts           # 确认/输入弹窗
│       ├── toast.ts           # Toast 通知
│       ├── icons.ts           # SVG 图标常量
│       ├── dom.ts             # DOM 查询工具函数
│       └── styles/
│           ├── tokens.css     # CSS 自定义属性（设计令牌）
│           ├── base.css       # 重置 & 基础样式
│           ├── layout.css     # 应用外壳（侧边栏、顶栏、内容区）
│           ├── components.css # 按钮、表单、卡片、表格、弹窗、Toast 等
│           ├── login.css      # 登录页样式
│           ├── editor.css     # 编辑器页面 + CodeMirror 样式
│           ├── versions.css   # 版本页样式
│           ├── headers.css    # 响应头页样式
│           └── responsive.css # 媒体查询 & 动画
├── .dev.vars                  # 本地开发密钥
└── .gitignore
```

## KV 数据模型

| 键 | 值 | 说明 |
|----|----|----|
| `config:current` | `{ versionId, updatedAt }` | 指向最新版本的指针 |
| `version:<ulid>` | `{ id, content, message, createdAt, contentHash }` | 版本快照 |
| `headers:config` | `{ "Header-Name": "value" }` | 自定义响应头 |
