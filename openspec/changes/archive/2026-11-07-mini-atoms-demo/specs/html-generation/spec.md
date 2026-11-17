# Spec Delta

## Purpose

根据用户一句话 Prompt，经内置百炼 / 浏览器自配 /（仅访客）mock 或预置示例生成可交互的单文件 HTML，供 Preview 与（已登录）Task 持久化使用。交卷以真 LLM 为准。

## ADDED Requirements

### Requirement: Accept one-sentence prompt
系统 SHALL 接受用户提交的自然语言 Prompt（一句话描述即可），并据此启动 HTML 生成流程。

#### Scenario: Valid prompt submitted
- **WHEN** 用户提交非空 Prompt
- **THEN** 系统接受请求并开始生成单文件 HTML

#### Scenario: Empty prompt rejected
- **WHEN** 用户提交空或仅空白的 Prompt
- **THEN** 系统拒绝生成并返回明确错误提示

### Requirement: Produce single-file HTML
系统 SHALL 返回一份可独立运行的单文件 HTML（样式与脚本内联或自包含），无需额外静态资源即可在 iframe 中交互。

#### Scenario: Successful generation
- **WHEN** 生成流程成功完成
- **THEN** 响应包含完整 HTML 文档字符串，且可在浏览器 iframe 中加载并交互

### Requirement: Built-in Bailian models on server
系统 SHALL 在服务端使用阿里百炼兼容端点与环境变量 `BAILIAN_API_KEY`（三模型共用）调用内置模型；baseUrl SHALL 为 `https://maas.qianwenaiapi.com/compatible-mode/v1`；可选模型 SHALL 包含 `qwen3.8-omni-flash`、`qwen3.8-max`、`qwen3.8-flash`。前端与生成结果中 MUST NOT 包含 API Key。

#### Scenario: Key never exposed to client
- **WHEN** 客户端调用生成接口或查看生成结果
- **THEN** 响应与页面中不出现 `BAILIAN_API_KEY` 或等价密钥

#### Scenario: Built-in mode badge
- **WHEN** 本次生成走内置百炼成功
- **THEN** UI 角标标明「内置」

### Requirement: Model priority and BYOK
生成来源优先级 SHALL 为：内置 → 失败或额度尽时引导用户自配 → **仅未登记邮箱的访客**才可使用 mock 或预置静态示例。自配模型配置 SHALL 仅存于浏览器本地；配置 UI SHALL 明确「出于安全考虑不做服务端持久化」。

#### Scenario: Quota exhaustion guides BYOK
- **WHEN** 内置调用返回 401/403/402/429，或错误信息表明 quota / insufficient / billing / rate 等额度问题
- **THEN** 系统提示用户配置自配模型（或换模型/重试），且 MUST NOT 将密钥写入服务端存储

#### Scenario: BYOK mode badge
- **WHEN** 本次生成使用浏览器自配模型成功
- **THEN** UI 角标标明「自配」

### Requirement: Streaming timeouts are not wall-clock hard cuts
流式生成 SHALL NOT 以墙钟硬掐总时长作为唯一超时策略。系统 SHALL 采用：首包超时约 30 秒；空闲超时约 60 秒（持续收到 chunk，含思考类内容，则不触发空闲超时）；可选极大保底超时（如 10 分钟）以防僵尸连接。

#### Scenario: First byte timeout
- **WHEN** 开始流式请求后约 30 秒内未收到首包
- **THEN** 系统判定超时并进入对应失败/兜底路径

#### Scenario: Idle timeout while chunks continue
- **WHEN** 流式过程中持续有 chunk 到达（含思考内容）
- **THEN** 系统不因空闲超时中断该次生成

### Requirement: Timeout fallback differs by guest vs signed-in
超时或内置失败后：未登记邮箱时系统 MAY 使用 mock 或仓库内预置静态 HTML 示例并标明 mock；已登记邮箱时系统 SHALL 展示失败并提供重试 / 换模型 / 自配 Key，MUST NOT 把 mock 作为主出路。

#### Scenario: Guest timeout may use mock
- **WHEN** 未填邮箱用户生成超时或内置失败
- **THEN** 系统可展示 mock 或预置示例 HTML，并角标标明「mock」

#### Scenario: Signed-in timeout does not prefer mock
- **WHEN** 已填邮箱用户生成超时或内置失败
- **THEN** 系统提示失败与重试/换模型/自配，不以 mock 作为默认主路径

### Requirement: Preset static HTML examples
仓库 SHALL 提供 3–4 个静态 HTML 示例，并在 UI 以标签等形式可供访客兜底或演示选用。

#### Scenario: Guest opens preset example
- **WHEN** 访客选择某一预置示例标签
- **THEN** 系统在 Preview 中加载对应静态 HTML，且不写入 Task 持久化
