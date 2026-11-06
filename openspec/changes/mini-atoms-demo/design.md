# Design

## Context

见 `proposal.md` Why。仓库为绿场；grilling R1–R4 + 用户修正已达成共识。约束：约 3–4h MVP、邮箱登记（非 OIDC）、Key 以服务端内置为主、尽早 Render 公网部署（Vercel 可选备选）。领域演进见 `GLOSSARY.md` 与 ADR-0002（取代 ADR-0001）。

## Goals / Non-Goals

**Goals:**

- Vite + React + 独立 API + Turso + Render，打通 Prompt → 生成 → iframe →（登录后）Task 持久化。
- 内置百炼三模型 + 额度/失败引导自配；访客才可 mock/预置示例；交卷以真 LLM 为准。
- 流式超时策略（首包/空闲/可选保底），非墙钟硬掐总时长。
- 赛马 2 路为可砍延展；不阻塞主路径。
- 部署优先级：链接 > 闭环 > 持久化 > 赛马。

**Non-Goals:**

- 分享直链、OIDC/注册验证码、完整版本树、Score 进模型、自动裁判。
- 生产级多租户审计/计费；自配 Key 的服务端持久化。
- 把 mock 当作交卷主内容。

## Decisions

### 1. 应用形态：Vite + React + 独立 API

- **选择**：Vite + React 前端；生成/Task 存取用同仓独立 API（Serverless/Edge 或极薄 Node handler）。
- **理由**：笔试时间紧；API 层便于藏 `BAILIAN_API_KEY` 与接 Turso。
- **锁定**：不再「Vite 或 Next 二选一」；实现按本决策落地。

### 2. 身份与 Task（相对 ADR-0001 的演进）

- **登录** = 提交邮箱登记（无验证码）；UI 提示冒充风险可接受。
- Email → 多个 Task；进入保存路径前须新建/打开 Task。
- Task 内只保留当前选定一份 Artifact（**覆盖写**）。
- Creation = Task 当前已保存产物的语义别名（非第二聚合）。
- 持久化按邮箱隔离，云端 Turso；本机 `localStorage` 最多记上次邮箱。
- **访客**：内置模型可生成并 Preview，不持久化，常驻提醒；禁止保存/无任务列表。
- **已登录**：须先 Task 再生成并保存。

### 3. LLM：内置百炼 → 自配 →（仅访客）mock

- **内置**（服务端）：
  - baseUrl: `https://maas.qianwenaiapi.com/compatible-mode/v1`
  - models: `qwen3.8-omni-flash`, `qwen3.8-max`, `qwen3.8-flash`
  - env: `BAILIAN_API_KEY`（三模型共用；永不进 git）
- **优先级**：内置 → 失败/额度尽引导自配 → **仅访客**才可 mock/预置静态示例（仓库内 3–4 个静态 HTML 标签）。
- **额度启发式**：HTTP 401/403/402/429，及响应文案含 quota / insufficient / billing / rate 等。
- **自配**：仅浏览器本地；配置时 UI 明确「出于安全考虑不做服务端持久化」。
- **角标**：内置 / 自配 / mock。
- **交卷**：以真 LLM 为准；mock 是保险丝不是交卷内容。

### 4. 流式超时（非墙钟硬掐）

- 首包超时约 **30s**；空闲超时约 **60s**（持续有 chunk，含思考内容，则不触发空闲超时）。
- 可选极大保底（如 **10min**）防僵尸连接。
- 超时后：
  - **未登录**：可走 mock / 预置静态示例。
  - **已登录**：失败 + 重试 / 换模型 / 自配 Key；**不把 mock 当主出路**。

### 5. 持久化：Turso + Task 表

- **选择**：Turso（libSQL）；逻辑模型以 Task 为聚合（email、prompt、html、**chat 时间线**、source、updated_at、meta 等）。
- **凭证**：`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`，仅环境变量 / `.env.local`。
- **Artifact + 对话**：登录用户在项目内生成成功后，**同一次覆盖写** `html` 与 `chat_json`（原子一致）；失败不落库。
- **chat 内容**：仅 `user` / `assistant` / `version`；**不存**流式思考过程。`prompt` 字段仅为「最近一轮需求摘要」，完整历史以 `chat_json` 为准。
- **裁剪**：服务端规范化时最多保留最近约 120 条；单条 user/assistant 文本过长截断。
- **列表**：Task 列表不返回完整 `html` / `chat`（减小体积）；打开单条时还原对话与预览。
- **不做**：分享直链、公开匿名可枚举的「全世界作品墙」（列表按邮箱隔离）。

### 6. 预览：iframe sandbox

- `iframe` + `sandbox`：`allow-scripts`（必要时 `allow-forms`）；**尽量不** `allow-same-origin`。
- 内容用 `srcDoc` 或 blob URL 注入生成 HTML。
- 预置 3–4 个仓库内静态 HTML 示例标签（供访客兜底/演示）。
- **迭代呈现（非落库）**：已有 Artifact 再生成时，代码区生成中保留上一版全文（不整页流式重刷）；成功后默认回 Preview；代码 Tab MAY 展示相对上一版的行级变更对照（折叠未改行）。Diff **不是**持久化实体，打开 Task 只恢复最终 Artifact + Chat Timeline。

### 7. 赛马：唯一延展亮点

- 2 路并行 + 用户择优；**无自动打分**；Score 不进模型。
- 核心闭环不稳则**整段砍**。
- 择优后写入当前 Task（覆盖）。

### 8. 部署与文档

- 尽早 Render 占位（单 Web Service：`build` + Node 同时 serve API 与 `dist`）；Vercel 为可选备选。优先级 链接 > 闭环 > 持久化 > 赛马。
- README SHALL 写清：与通过案例差异（服务端内置 Key vs 浏览器 BYOK）及未做项。

## Risks / Trade-offs

- [LLM 超时/额度] → 首包/空闲超时 + 额度启发式 + 访客才 mock；已登录引导自配/重试
- [iframe 安全 vs 交互] → sandbox 尽量无 same-origin；允许必要 scripts/forms
- [邮箱冒充] → MVP 接受；UI 提示；不做验证码/OIDC
- [Key 误提交] → `.gitignore` 覆盖 `.env*`；清单强调勿提交
- [赛马拖垮主路径] → 可整段砍；tasks 将其放最后

## Migration Plan

1. 脚手架 + 健康检查 + 尽早 Render 占位。
2. 内置百炼流式生成 + iframe Preview（访客路径）。
3. 邮箱登记 + Task CRUD（Turso）+ 登录保存路径。
4. 自配模型、超时/额度引导、预置示例标签。
5. （可选）赛马。
6. README 差异与未做项；回滚：去掉最新部署，演示数据可清表。

## Open Questions

- （已关闭）脚手架：锁定 Vite + React + 独立 API。
- （已关闭）DB：锁定 Turso。
- （已关闭）LLM：锁定百炼兼容 + `BAILIAN_API_KEY`。
- 实现时若百炼流式协议细节与 OpenAI 兼容有偏差，以实测调整客户端解析，不改变本设计优先级。
