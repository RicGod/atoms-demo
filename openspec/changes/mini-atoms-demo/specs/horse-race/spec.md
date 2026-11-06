# Spec Delta

## Purpose

对同一 Prompt 并行发起两路 HTML 生成（赛马），展示候选并由用户择优进入 Preview 与当前 Task 覆盖保存。此为唯一延展亮点；核心闭环不稳时可整段不做。无自动打分；Score 不进模型。

## ADDED Requirements

### Requirement: Dual parallel generation
系统 SHALL 支持对同一 Prompt 并行发起两路生成请求，得到两份候选单文件 HTML。

#### Scenario: Horse race run
- **WHEN** 已具备赛马能力的用户启用赛马模式并提交 Prompt
- **THEN** 系统返回（或逐步展示）两路候选 HTML

### Requirement: User picks winner without automatic scoring
系统 SHALL 允许用户选择其中一路作为优胜结果；MUST NOT 使用自动打分或 Score 模型裁定 Winner。选定后该结果成为当前 Preview；若用户已打开 Task，则可按 task-store 规则覆盖保存。

#### Scenario: User picks winner
- **WHEN** 两路候选均已就绪且用户选择其一
- **THEN** 预览切换为所选 HTML，并可在已打开 Task 中触发覆盖保存

#### Scenario: Partial failure still usable
- **WHEN** 两路中仅一路成功返回 HTML
- **THEN** 系统仍展示成功一路供预览，并提示另一路失败

### Requirement: Horse race is optional extension
赛马 SHALL 视为可整段砍掉的延展：当核心闭环（生成→预览→登录 Task 持久化）未稳定时，实现与交付 MAY 省略本能力，并在 README/说明中标明未做。

#### Scenario: Core unstable skips horse race
- **WHEN** 团队判定核心闭环不稳或时间不足
- **THEN** 可不交付赛马，且不以赛马阻塞公网链接与主闭环验收

### Requirement: Mock in horse race only for guests
当走 mock / 预置示例路径时，赛马模式 MAY 为**未登记邮箱**访客产出两路可区分的演示 HTML；已登记邮箱用户 MUST NOT 将 mock 赛马作为失败后的主出路（与 html-generation 超时分流一致）。

#### Scenario: Guest horse race without usable built-in
- **WHEN** 未填邮箱且内置不可用、用户启动赛马兜底
- **THEN** 系统可以 mock/预置提供两路可预览候选并标明 mock 模式

#### Scenario: Signed-in horse race failure path
- **WHEN** 已填邮箱用户赛马两路均因超时或额度失败
- **THEN** 系统提示失败与重试/换模型/自配，不以 mock 赛马为主路径
