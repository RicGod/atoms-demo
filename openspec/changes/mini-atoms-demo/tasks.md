# Tasks

> 实现优先级：**链接 > 闭环 > 持久化 > 赛马**。赛马为核心闭环不稳时可整段跳过的唯一延展。

## 1. 脚手架与环境

- [x] 1.1 初始化 **Vite + React + 独立 API**，验证 `dev` 可启动空白页
- [x] 1.2 配置 `.gitignore`（含 `.env*`）与 `.env.example` / `.env.local` 占位（`BAILIAN_API_KEY`、`TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`），验证示例文件无真实密钥
- [x] 1.3 增加健康检查接口（如 `/api/health`），验证本地可返回 OK
- [ ] 1.4 **尽早**部署到 Render 占位并配置环境变量槽位；验证公网 health（优先拿链接）
  - 代码侧已就绪：`render.yaml` + 生产 `npm start`（API + `dist`）+ README；Vercel 配置仍保留为备选；需用户 Render 账号实际部署后回填公网 URL

## 2. HTML 生成（html-generation）

- [x] 2.1 实现服务端生成接口：校验非空 Prompt；内置百炼兼容（baseUrl + 三模型 + `BAILIAN_API_KEY`）；流式输出；验证有 Key 时可返回 HTML
- [x] 2.2 实现流式超时：首包 ~30s、空闲 ~60s、可选保底 ~10min；验证超时行为符合访客/已登录分流
- [x] 2.3 实现额度启发式（401/403/402/429 及 quota/insufficient/billing/rate 等）并引导自配；验证角标「内置」
- [x] 2.4 实现浏览器自配模型（仅本地存储）；配置 UI 明确「出于安全考虑不做服务端持久化」；角标「自配」
- [x] 2.5 访客路径：失败/超时可 mock 或预置 3–4 个仓库内静态 HTML 示例；角标「mock」；**交卷不以 mock 为主**
- [x] 2.6 已登录超时/失败：失败提示 + 重试/换模型/自配；不以 mock 为主出路
- [x] 2.7 确认响应与前端均无 `BAILIAN_API_KEY`；手工核对验证

## 3. 预览与身份 UI（live-preview）

- [x] 3.1 实现 Prompt 输入 + 生成 + iframe 预览；`sandbox` 含 `allow-scripts`（必要时 `allow-forms`），尽量不 `allow-same-origin`；验证 iframe 内可交互
- [x] 3.2 实现邮箱登记（无验证码）与冒充风险提示；`localStorage` 最多记上次邮箱
- [x] 3.3 访客：可生成并 Preview，常驻「不持久化」提醒；禁止保存控件 / 无任务列表
- [x] 3.4 已登录：须先新建或打开 Task 再进入保存路径；实现 Regenerate 覆盖当前预览
- [x] 3.5 角标展示 Generation Mode：内置 / 自配 / mock

## 4. Task 持久化（task-store）

- [x] 4.1 接入 Turso，建表/迁移 Task（按邮箱隔离；覆盖写当前 Artifact）；验证可写入测试记录
  - 未配 Turso 时降级内存存储；配齐 env 后走 libSQL
- [x] 4.2 实现 Task 新建、打开、列表、保存（覆盖）、详情 API；验证仅能见本邮箱 Task
- [x] 4.3 前端接入 Task 列表与回看；验证刷新后仍能打开已存 Task
- [x] 4.4 抽查持久化记录无密钥字段；验证访客无法保存

## 5. 赛马延展（horse-race · 可整段砍）

- [ ] 5.1 仅在核心闭环稳定后实现：并行两路生成；验证返回两份候选
- [ ] 5.2 UI：A/B 展示、用户择优（无自动打分）；写入当前 Task（覆盖）；验证单路失败时另一路仍可用
- [x] 5.3 若时间不够：文档标明未做赛马并跳过本段
  - README「明确未做项 / 剩余能力」已标明 Horse Race 未实现

## 6. 文档与验收

- [x] 6.1 README 写清与通过案例差异（服务端内置 Key vs 浏览器 BYOK）及未做项（无分享直链 / 无 OIDC / 无版本树 / Score 不进模型等）
- [ ] 6.2 对照避坑：public 仓库/链接、无 Key 入库、真实交互+（登录后）持久化；记录公网 URL
  - README 已对照避坑；公网 URL 待 Render 部署后填写
- [ ] 6.3 端到端：真 LLM 交卷路径（内置 Key）走通 Prompt→Preview→Task 保存→回看
  - 代码路径已就绪；需配置 `BAILIAN_API_KEY`（建议同时配 Turso）后手工验收

## Workflow follow-up

- 规划已按共识回写；用户下一步说 **`openspec apply`**（或 `/opsx-apply`）才写业务代码
- 实现与验收完成后再 archive 本 change
