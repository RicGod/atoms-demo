# Proposal

## Why

笔试需在约 3–4 小时内交付一个可公网访问的 Mini Atoms Demo：用户用一句话描述想法，系统生成可交互的单文件 HTML 并即时预览；已登记邮箱的用户可在 Task 内持久化回看。参考 [atoms.dev](https://atoms.dev) 与案例 [atoms-demo.pub.atoms.world](https://atoms-demo.pub.atoms.world)（对方 BYOK 把 Key 放浏览器；本方案以**服务端内置百炼 Key**交卷，浏览器自配仅作降级），并遵循避坑要点：public 链接、无 Key 入库、真实交互 + 持久化。grilling R1–R4 共识已锁定身份/Task/模型/超时边界。

## What Changes

- 新建可部署 Web 应用：**Vite + React + 独立 API**；持久化 **Turso**；部署 **Vercel**。
- 核心链路：Prompt → 服务端（或浏览器自配）LLM 生成**单文件 HTML** → iframe Preview →（已登录）Task 内覆盖保存。
- **身份**：「登录」= 提交邮箱登记（无验证码、无 OIDC）；Email → 多个 Task；进入保存路径前须新建/打开 Task；Task 内只保留当前选定一份 Artifact（覆盖写）。
- **访客 vs 登录**：未填邮箱可用内置模型生成并 Preview，**不持久化**，常驻提醒；禁止保存/无任务列表。已填邮箱须先 Task 再生成并保存。
- **模型**：内置阿里百炼兼容（`BAILIAN_API_KEY`，三模型共用）；失败/额度尽引导自配；**仅访客**才可 mock/预置静态示例。交卷以真 LLM 为准；mock 是保险丝不是交卷内容。角标标明：内置 / 自配 / mock。
- **超时（流式）**：非墙钟硬掐；首包 ~30s、空闲 ~60s；可选极大保底（如 10min）。超时后 mock 仅未登录；已登录失败 + 重试/换模型/自配。
- **延展**：赛马 = 唯一延展亮点；2 路并行 + 用户择优（无自动打分）；核心闭环不稳则整段砍。
- **明确不做**：分享直链、OIDC、版本树、Score 进模型。
- 尽早 Vercel 占位；优先级：**链接 > 闭环 > 持久化 > 赛马**。
- README 写清与通过案例差异及未做项。

## Capabilities

### New Capabilities

- `html-generation`：根据 Prompt 经内置百炼 / 自配 /（仅访客）mock 生成可交互单文件 HTML；含流式超时与额度启发式。
- `live-preview`：iframe 安全预览；访客可 Preview 不保存；已登录绑定 Task。
- `task-store`（原 `creation-store` 语义演进）：按邮箱隔离的 Task 持久化（Turso）；列表与回看；Creation = Task 当前已保存产物。
- `horse-race`：同一 Prompt 并行 2 路生成，用户择优（无自动打分）；可整段砍掉。

### Modified Capabilities

- （无主 specs；本 change 为绿场。能力名由规划中的 `creation-store` 对齐为 `task-store`。）

## Impact

- **代码**：Vite + React 前端 + 独立 API（生成、Task CRUD、可选赛马）；实现阶段由 `openspec apply` 执行，本提案不写业务代码。
- **依赖**：百炼兼容 HTTP、Turso、Vercel。
- **安全**：`BAILIAN_API_KEY` / Turso 凭证仅服务端；自配 Key 仅浏览器本地且 UI 明确「不做服务端持久化」；密钥永不进 git。
- **运维**：`BAILIAN_API_KEY`、`TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`；公网域名在首次成功部署后产生。
- **领域**：见 `GLOSSARY.md`、`docs/adr/0002-task-is-durable-aggregate-under-email.md`（取代 ADR-0001）。
