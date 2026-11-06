# Task 是按邮箱隔离的持久化聚合

## Status

Accepted（取代 ADR-0001）

## Context

grilling R1–R4 与用户修正达成共识后：需要「真实交互 + 云端持久化」，但仍排除 OIDC、版本树、自动裁判与 Score。ADR-0001 将 Creation 定为唯一持久化聚合且不引入 User，已不足以表达「邮箱登记 → 多 Task → Task 内覆盖写当前 Artifact」的边界。

## Decision

1. **User (Email)**：提交邮箱即「登录」（无验证码）；UI 可提示冒充风险，MVP 可接受。持久化按邮箱隔离（云端 Turso）。本机 `localStorage` 最多记住上次邮箱。
2. **Task** 为唯一持久化领域聚合：内含当前 Prompt、当前选定 Artifact（覆盖写）及必要元数据。进入保存路径前必须新建或打开 Task。
3. **Creation** 对齐为 Task 的当前已保存产物语义，**不是**并列的第二套聚合。
4. **访客（未填邮箱）**：可用内置模型生成并 Preview，**不持久化**，常驻提醒；禁止保存、无任务列表。
5. **已填邮箱**：须先 Task 再生成并保存。
6. **仍不做**：分享直链、OIDC、版本树、Score 进模型；Horse Race 不落独立 Race 聚合；默认不存 runner-up。

## Relates to ADR-0001

| ADR-0001 | ADR-0002 |
|----------|----------|
| Creation 唯一落库 | Task 唯一落库；Creation = 当前产物别名 |
| 不引入 User | 引入 Email 身份（非 OIDC） |
| 免登录即可保存 | 保存须邮箱 + Task；访客仅 Preview |
| 无用户隔离 | 按邮箱隔离（Turso） |

## Consequences

- 未绑定 Task / 未登记邮箱的 Artifact 刷新即失
- 回看打开的是 Task，不能按版本树浏览
- 实现与 OpenSpec 能力名由 `creation-store` 演进为 `task-store` 语义
- README 须写明与通过案例差异：服务端内置 Key vs 浏览器 BYOK，以及明确未做项
