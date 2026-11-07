# Mini Atoms Demo

一句话 Prompt → 可交互单文件 HTML → iframe Preview →（登记邮箱后）项目（Task）持久化与对话迭代。已登录可赛马择优。

OpenSpec change：`mini-atoms-demo`。

**公网**：https://atoms-demo-7qi4.onrender.com/

## 与通过案例的差异

| 点 | 通过案例（参考） | 本 Demo |
| --- | --- | --- |
| LLM Key | 浏览器 BYOK 为主 | **服务端内置**百炼 Key（本地 `aliQwen-api` / 兼容 `BAILIAN_API_KEY`）交卷；浏览器自配仅为降级（登录后可配） |
| 身份 | 视对方实现 | 邮箱登记（无验证码 / 无 OIDC） |
| 持久化 | 视对方实现 | **Turso**，按邮箱隔离的 Task（对外称「项目」）；线性 Version 快照 + Current 指针 |
| 生成角标 | — | **内置 / 自配 / mock** |
| 迭代 | — | 多轮 Prompt + 历史摘要 + 当前 HTML → 整页覆盖 |
| 赛马 | — | 仅登录；固定两路不同内置模型；人择 Winner；`source=horse-race` |

## 明确未做项

- 分享直链（不做公开作品直链产品路径）
- OIDC / 注册验证码
- Git 式分支版本树（仅 Task 内线性快照，上限 20，可回滚与导出当前版）
- Score / 自动裁判（Score 不进模型与持久化）
- 真多文件工程 / 真文件树 / AST 补丁
- 访客赛马

## 测试

```bash
# 单元 / 接口 seam（Vitest，不打真实百炼）
npm test

# 端到端（Playwright；默认用本机 Chrome channel，无需下载自带 Chromium）
# 会自动起 npm run dev；用例内 mock /api/generate，不依赖真 Key
# 注意：e2e/ 仅本地保留、未进仓；需本机已有 e2e 目录与用例后再跑 test:e2e
npm run test:e2e
```

## 本地启动

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（可选；无 Key 时访客可走 mock/预置）
cp .env.example .env.local
# 本地百炼 Key：优先用系统/用户环境变量 aliQwen-api（已配置则无需写进 .env.local）
# 亦可在 .env.local 写 BAILIAN_API_KEY；Turso 必填：TURSO_DATABASE_URL / TURSO_AUTH_TOKEN

# 3. 同时启动前端 + API
npm run dev
```

- Web：<http://127.0.0.1:5173>
- API health：<http://127.0.0.1:3001/api/health>（前端经 Vite 代理亦可访问 `/api/health`）
- 启动日志对百炼 Key 只打印 `present` / `missing`，不会打印 Key 内容

### 仅 API

```bash
npm run start:api
```

### 仅前端

```bash
npm run dev:web
```

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `aliQwen-api` | **本地优先**：系统/用户环境变量中的百炼 Key（含连字符）；服务端 `process.env['aliQwen-api']` |
| `BAILIAN_API_KEY` | 兼容回退名；`.env.local` 与 **Render 推荐用此名**（平台变量名通常不允许连字符） |
| `TURSO_DATABASE_URL` | Turso 数据库 URL（必填；未配置则 Task API 失败） |
| `TURSO_AUTH_TOKEN` | Turso Auth Token（必填） |
| `API_PORT` | 本地 API 端口，默认 `3001` |
| `PORT` | **Render 自动注入**的监听端口；生产启动优先读 `PORT`，勿在面板写死 |

读取顺序：`aliQwen-api` → `BAILIAN_API_KEY`。二者择一即可；本地已设系统变量时不必再写 `.env.local`。

密钥规则：

- **永不进 git**（`.gitignore` 覆盖 `.env*`，仅保留 `.env.example`）
- 不进前端包、不进 API 响应、不进 Task 持久化字段、不进启动日志正文
- 浏览器自配 Key **只存 localStorage**，配置 UI 标明「出于安全考虑不做服务端持久化」

内置模型：

- baseUrl：`https://maas.qianwenaiapi.com/compatible-mode/v1`（百炼 OpenAI 兼容口；四模型共用）
- models：`qwen3.8-omni-flash` / `qwen3.8-max` / `qwen3.8-flash` / `deepseek-v4.1-flash`
- `deepseek-v4.1-flash`：仅切换模型名，仍走上述 BAILIAN 兼容端点与同一 Key（`aliQwen-api` / `BAILIAN_API_KEY`）；当前**不**单独配置 DeepSeek 官方 `baseURL` / `DEEPSEEK_API_KEY`

## 部署（Render · 推荐）

**默认方案**：单个 Web Service，`npm run build` 后由 Node（`npm start`）同时 serve `/api/*` 与 Vite 静态 `dist/`（见 `server/index.ts` + `render.yaml`）。

仓库已含 `render.yaml` Blueprint；亦可在 Dashboard 手工创建 Web Service。

1. 将 GitHub 仓库 **`RicGod/atoms-demo`** 设为 **public**（笔试要求）
2. 打开 [Render](https://render.com/) → **New** → **Blueprint**（选本仓库，读 `render.yaml`），或 **Web Service** 直连该仓库
3. 构建 / 启动命令（Blueprint 已写好；手工创建时照填）：
   - **Build Command**：`npm install --include=dev && npm run build`
   - **Start Command**：`npm start`
4. 环境变量（Environment）必填 / 建议：
   - `BAILIAN_API_KEY`（**不要依赖** `aliQwen-api`：平台变量名通常不允许连字符）
   - `TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`（必填；未配则 Task 持久化失败）
   - `PORT` 由 Render 注入，**无需**也不应手工写死
   - `NODE_ENV=production`（Blueprint 已设）
5. 部署后访问 `/api/health` 冒烟（`bailianConfigured: true` 表示 Key 已生效）

当前公网 URL：https://atoms-demo-7qi4.onrender.com/

**备选（Vercel）**：仍保留 `vercel.json` 与 `api/[[...path]].ts`，可按需 Import；主路径以 Render 为准。

## 使用路径

1. **访客**：首页输入 Prompt → 生成 → 左对话 + 右预览/代码；失败/超时可 mock 或点预置示例；**不能保存、不能赛马**
2. **已登录**：邮箱登录 → 项目列表 → 进入项目 → 多轮对话迭代（覆盖保存）→ 可选赛马择优（`horse-race`）
3. **交卷主路径**：配置真实百炼 Key（本地 `aliQwen-api` 或 `BAILIAN_API_KEY`；Render 用 `BAILIAN_API_KEY`）+ Turso，走内置生成而非 mock

## 避坑对照

- public 仓库 + 可访问链接
- Key 不入库、不进 git
- 真实交互（iframe + scripts）+ 登录后持久化
- mock 是保险丝，不是交卷内容
- 浅色仿 Atoms UI；对外文案「项目」= 对内 Task
