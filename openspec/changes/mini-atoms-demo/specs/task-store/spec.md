# Spec Delta

## Purpose

按邮箱隔离，将 Task（当前 Prompt、选定 Artifact 与元数据）持久化到 Turso，并支持列表与回看。Creation 语义对齐为 Task 的当前已保存产物，不是并列聚合。满足笔试「真实交互 + 持久化」（登录路径）。

## ADDED Requirements

### Requirement: Task is the durable aggregate
系统 SHALL 以 Task 作为唯一持久化领域聚合；每个 Task SHALL 只保留当前选定的一份 Artifact（覆盖写）。Creation SHALL 仅表示该 Task 的当前已保存产物，MUST NOT 作为第二套独立落库聚合。每个已保存 Task SHALL 可携带一条对话时间线（`chat`），与当前 Artifact **同一次覆盖写**，保持一致。

#### Scenario: Save overwrites current artifact
- **WHEN** 用户在同一 Task 下再次保存新的生成结果
- **THEN** 系统覆盖该 Task 的当前 Artifact、对话时间线与相关 Prompt/元数据，不保留版本树

#### Scenario: Chat and HTML saved together
- **WHEN** 已登录用户在打开的 Task 中一次生成成功并自动保存
- **THEN** 系统在同一次写入中更新 HTML 与 chat（至少含本轮 user、assistant，以及可选 version 标记），不得只更新其中一侧

#### Scenario: Thinking is not persisted
- **WHEN** 生成过程中产生流式思考/阶段文案
- **THEN** 这些内容 MUST NOT 写入 Task 的 chat 持久化字段

### Requirement: Persist only for signed-in users with a Task
系统 SHALL 仅在用户已登记邮箱且已新建/打开 Task 时允许持久化保存。未填邮箱时 MUST NOT 写入 Task 存储。

#### Scenario: Save succeeds for signed-in Task
- **WHEN** 已填邮箱用户在打开的 Task 中保存一次成功生成的产物
- **THEN** 系统写入 Turso 并返回可回看的 Task 标识

#### Scenario: Guest cannot persist
- **WHEN** 未填邮箱用户触发保存
- **THEN** 系统拒绝写入持久化存储

### Requirement: Email-scoped list and reopen
系统 SHALL 按邮箱隔离提供 Task 列表，并允许打开历史 Task 以恢复 Prompt、HTML 预览与对话时间线。本机 `localStorage` MAY 最多记住上次邮箱，MUST NOT 作为跨用户数据源。

#### Scenario: List tasks for current email
- **WHEN** 已登记邮箱用户打开任务列表
- **THEN** 系统仅展示该邮箱下的 Task 摘要（至少含标识、标题/Prompt 摘要、时间）；列表 MUST NOT 返回完整 HTML 或完整 chat

#### Scenario: Reopen task by id
- **WHEN** 用户选择某一本邮箱下的 Task 标识
- **THEN** 系统加载对应 Prompt、HTML 与 chat，并在预览区与对话区展示（若 chat 为空但已有 HTML，MAY 展示简短引导文案）

#### Scenario: Cross-email isolation
- **WHEN** 用户 A 的邮箱会话请求用户 B 邮箱下的 Task
- **THEN** 系统拒绝或返回不可见，不得展示他邮箱数据

### Requirement: No secrets in persisted records
持久化记录 MUST NOT 存储 `BAILIAN_API_KEY`、自配 API Key、Turso 凭证或其它密钥材料。Score MUST NOT 作为字段进入模型或持久化。

#### Scenario: Stored payload has no secrets
- **WHEN** Task 被写入数据库
- **THEN** 记录字段中不包含 API Key、Auth Token、连接串或 Score 用途字段

### Requirement: No share deep-links as a product feature
系统 MUST NOT 将「分享直链」作为 MVP 交付能力（不做面向任意访客的公开作品直链产品路径）。

#### Scenario: MVP omits share link feature
- **WHEN** 对照产品范围验收
- **THEN** 不存在已承诺的分享直链功能入口作为必交付项
