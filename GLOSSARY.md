# Mini Atoms Demo

用户用一句话描述想法，系统生成可交互的单文件 HTML，即时预览；已登记邮箱的用户可在 Task 内持久化回看。可选对同一 Prompt 并行两路生成后择优。本词汇表只定义领域语言，不含技术实现细节。

## Language

### 身份与任务

**User (Email)**:
以邮箱字符串标识的使用者身份；「登录」仅指提交邮箱登记（无验证码、无 OIDC）。同一邮箱下可拥有多个 Task。
_Avoid_: Account, Profile, OAuth user, 账号体系（暗示完整用户系统时）

**Task**:
按邮箱隔离的持久化聚合：一次创作工作单元，内含当前 Prompt、当前选定 Artifact（覆盖写），以及必要元数据。进入保存路径前必须新建或打开 Task。
_Avoid_: Project, Session, Workspace, Document（过宽或与 Artifact 混淆）

**Creation**:
Task 的当前已保存产物之语义别名（Prompt + 选定 Artifact 等），**不是**独立于 Task 的第二套持久化聚合。回看与列表以 Task 为准。
_Avoid_: 把 Creation 当作与 Task 并列的唯一 DB 聚合；Version tree

### 输入与产物

**Prompt**:
用户提交的一句自然语言描述，是一次生成流程的输入意图。
_Avoid_: Idea, Query, Instruction, 想法（口语可说「想法」，书面与模型统一用 Prompt）

**Artifact**:
一次生成流程产出的、可独立运行的单文件 HTML 文档（样式与脚本自包含）。Task 内只保留当前选定的一份（覆盖写）。
_Avoid_: Page, App, Site, Document, 页面（泛指）

### 会话呈现

**Preview**:
当前会话中用于展示某一 Artifact 的即时预览视图；本身不是持久化实体。未登记邮箱也可 Preview，但不得持久化。
_Avoid_: Render, Sandbox view, Demo（与「产品演示」混淆时）

**Regenerate**:
在同一 Prompt 下再次触发生成，用新的 Artifact 替换当前 Preview 中的内容；若已绑定 Task 且走保存路径，则覆盖 Task 内当前 Artifact。
_Avoid_: Retry（仅表示网络重试时）, Refresh（仅表示刷新页面时）

### 赛马

**Horse Race**:
对同一 Prompt 并行发起两路生成、得到两份候选 Artifact、由用户择优的流程（无自动打分）。为核心闭环不稳时可整段砍掉的唯一延展亮点。
_Avoid_: A/B Test, Tournament, Battle, Comparison（无「并行生成」语义时）

**Candidate**:
Horse Race 中一路生成得到的 Artifact（尚未被选为优胜）。
_Avoid_: Variant, Option, Runner（口语可说 runner-up，模型用 Candidate）

**Winner**:
用户在 Candidate 中选定的那一份 Artifact；选定后成为当前 Preview，并可在已打开的 Task 中覆盖保存。
_Avoid_: Score winner, Champion, Best（暗示自动打分时）

### 生成来源（元数据语义）

**Generation Mode**:
一次生成所采用的来源语义：内置 LLM、浏览器自配模型（BYOK），或仅访客可用的 mock / 预置静态示例。UI 角标 SHALL 标明内置 / 自配 / mock。
_Avoid_: Environment, Fallback flag（纯技术字段名）

**Task Source**（原 Creation Source）:
当前 Task 产物如何产生：单路生成，或经 Horse Race 择优后保存。
_Avoid_: Type, Kind, Category（过宽）

**Score**:
不进入产品模型与持久化；不做自动裁判打分。
_Avoid_: Rating, Judge score（作为领域概念引入时）
