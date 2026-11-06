# Spec Delta

## Purpose

在页面内用 iframe 即时预览生成的单文件 HTML；支持重新生成；区分访客（可 Preview 不持久化）与已登记邮箱（须绑定 Task 后保存）。

## ADDED Requirements

### Requirement: Iframe preview of generated HTML
系统 SHALL 在应用页面内用 iframe 展示当前选中的生成 HTML，使用户能看到真实交互效果。iframe `sandbox` SHALL 包含 `allow-scripts`，必要时可含 `allow-forms`，并 SHOULD 避免 `allow-same-origin`。

#### Scenario: Preview after generation
- **WHEN** 生成接口返回 HTML（或选用预置示例）
- **THEN** 页面 iframe 加载该 HTML 并可交互操作

### Requirement: Regenerate from same prompt
系统 SHALL 允许用户基于同一 Prompt 重新触发生成，并用新结果更新预览。

#### Scenario: User requests regenerate
- **WHEN** 用户在已有 Prompt 下点击重新生成
- **THEN** 系统再次生成 HTML 并刷新 iframe 预览

### Requirement: Guest may preview without persistence
未填邮箱的访客 SHALL 可使用内置模型生成并 Preview；系统 SHALL 常驻提醒「不持久化」；系统 MUST NOT 提供保存成功路径，MUST NOT 展示任务列表。

#### Scenario: Anonymous user previews
- **WHEN** 未填邮箱用户完成一次成功生成
- **THEN** 用户可查看 iframe 预览，且无法将结果保存为 Task

#### Scenario: Guest sees persistence reminder
- **WHEN** 访客处于可生成/预览状态
- **THEN** UI 常驻提示当前不会持久化

### Requirement: Signed-in requires Task before save path
已填邮箱的用户 SHALL 在进入保存路径前新建或打开一个 Task；生成并保存时 Artifact SHALL 覆盖写入该 Task 的当前产物。

#### Scenario: Signed-in without Task cannot save
- **WHEN** 已填邮箱但尚未新建/打开 Task 的用户尝试保存
- **THEN** 系统阻止保存并提示先创建或打开 Task

#### Scenario: Signed-in with Task can overwrite artifact
- **WHEN** 用户在已打开的 Task 中生成成功并确认保存
- **THEN** Task 内仅保留当前选定的一份 Artifact（覆盖写），Preview 与之一致

### Requirement: Iteration presentation may show a non-persistent diff
当工作区已有当前 Artifact 且用户发起对话式迭代时，系统 MAY 在生成过程中于代码区保留上一版全文（避免整页流式重刷）；成功后 SHALL 用新 Artifact 更新 Preview，并默认展示预览。代码视图 MAY 提供相对上一版的行级变更对照。该 Diff **MUST NOT** 作为持久化实体写入 Task；重新打开 Task 时只恢复最终 Artifact 与对话时间线。

#### Scenario: Iteration keeps previous code while generating
- **WHEN** 用户在已有预览 HTML 的项目中再次发送优化类 Prompt 且生成进行中
- **THEN** 代码区不因流式输出而清空并整页重写上一版内容（MAY 显示修改中状态）

#### Scenario: Iteration success defaults to preview
- **WHEN** 迭代生成成功并更新当前 Artifact
- **THEN** 界面默认回到 Preview；用户可切换到代码视图查看可选的变更对照

#### Scenario: Diff is not reopened from storage
- **WHEN** 用户关闭后再次打开同一 Task
- **THEN** 系统恢复最终 HTML 与对话时间线，MUST NOT 要求恢复上一次的 Diff 视图为持久状态

### Requirement: Email registration is login
系统 SHALL 将「登录」实现为提交邮箱登记（无验证码、无 OIDC）；UI MAY 提示冒充风险。本机 MAY 用 `localStorage` 最多记住上次邮箱。

#### Scenario: User submits email
- **WHEN** 用户提交非空邮箱字符串完成登记
- **THEN** 系统视为已登录身份，并允许进入 Task 相关能力
