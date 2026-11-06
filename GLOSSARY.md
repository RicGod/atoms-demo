# Mini Atoms Demo

用户用一句话描述想法，系统生成可交互的单文件 HTML，即时预览；已登记邮箱的用户可在「项目」（对内 Task）内多轮对话迭代并持久化回看。已登录用户可选对同一 Prompt 并行两路生成后择优（赛马）。本词汇表只定义领域语言，不含技术实现细节。

## Language

### 身份与任务

**User (Email)**:
以邮箱字符串标识的使用者身份；「登录」仅指提交邮箱登记（无验证码、无 OIDC）。同一邮箱下可拥有多个 Task。
_Avoid_: Account, Profile, OAuth user, 账号体系（暗示完整用户系统时）

**Task**:
按邮箱隔离的持久化聚合：一次创作工作单元，内含当前 Prompt、当前选定 Artifact（覆盖写），以及必要元数据。进入保存路径前必须新建或打开 Task。API / 规格 / 内部代码仍称 Task。
_Avoid_: Session, Workspace, Document（过宽或与 Artifact 混淆）

**Project（项目）**:
**Task 的对外 UI 别名**（1:1）。登录后「项目列表」= Task 列表；进入「项目」= 打开该 Task（左对话 + 右 Preview/代码）。禁止把 Project 建成第二套落库聚合，禁止「一个 Project 含多个 Task」的容器语义。
_Avoid_: Project folder, Workspace container, 多 Task 文件夹

**Creation**:
Task 的当前已保存产物之语义别名（Prompt + 选定 Artifact 等），**不是**独立于 Task 的第二套持久化聚合。回看与列表以 Task 为准。
_Avoid_: 把 Creation 当作与 Task 并列的唯一 DB 聚合；Version tree

### 输入与产物

**Prompt**:
用户提交的一句自然语言描述，是一次生成或迭代流程的输入意图。
_Avoid_: Idea, Query, Instruction, 想法（口语可说「想法」，书面与模型统一用 Prompt）

**Artifact**:
一次生成流程产出的、可独立运行的单文件 HTML 文档（样式与脚本自包含）。Task 内只保留当前选定的一份（覆盖写）。MVP **不**引入多文件包 / 真文件树。
_Avoid_: Page, App, Site, Document, 页面（泛指）；ArtifactBundle（多文件包，Post-MVP）

### 会话呈现

**Preview**:
当前会话中用于展示某一 Artifact 的即时预览视图；本身不是持久化实体。未登记邮箱也可 Preview，但不得持久化。
_Avoid_: Render, Sandbox view, Demo（与「产品演示」混淆时）

**Workspace（工作区）**:
打开项目后的界面编排口语：左对话区 + 右 Preview / 代码切换。**不是**领域实体，不落库。
_Avoid_: 把 Workspace 写成第二套持久化聚合

**Regenerate / 对话式迭代**:
在同一项目内多轮 Prompt：服务端结合对话历史摘要与当前 HTML，整页覆盖生成新 Artifact；若已绑定 Task，保存时覆盖 Task 内当前 Artifact。
_Avoid_: Retry（仅表示网络重试时）, Refresh（仅表示刷新页面时）；AST 补丁、真版本树回看

**Version（版本 N）**:
仅 UI 装饰性里程碑文案（如「版本 1」）；**不可**回看历史版本。仍无 Version 聚合与版本树。
_Avoid_: Version tree, Checkpoint restore

### 赛马

**Horse Race**:
对同一 Prompt 并行发起两路内置生成（固定不同内置模型）、得到两份候选 Artifact、由用户择优的流程（无自动打分）。**仅登录用户**可用；访客禁用赛马。核心闭环不稳时可整段砍掉。
_Avoid_: A/B Test, Tournament, Battle, Comparison（无「并行生成」语义时）；访客赛马

**Candidate**:
Horse Race 中一路生成得到的 Artifact（尚未被选为优胜）。
_Avoid_: Variant, Option, Runner（口语可说 runner-up，模型用 Candidate）

**Winner**:
用户在 Candidate 中选定的那一份 Artifact；选定后成为当前 Preview，并可在已打开的 Task 中覆盖保存（source = horse-race）。
_Avoid_: Score winner, Champion, Best（暗示自动打分时）

### 生成来源（元数据语义）

**Generation Mode**:
一次生成所采用的来源语义：内置 LLM、浏览器自配模型（BYOK），或仅访客可用的 mock / 预置静态示例。UI 角标 SHALL 标明内置 / 自配 / mock。自配模型配置 UI **仅登录后**展示。
_Avoid_: Environment, Fallback flag（纯技术字段名）

**Task Source**（原 Creation Source）:
当前 Task 产物如何产生：单路生成（single），或经 Horse Race 择优后保存（horse-race）。
_Avoid_: Type, Kind, Category（过宽）

**Score**:
不进入产品模型与持久化；不做自动裁判打分。
_Avoid_: Rating, Judge score（作为领域概念引入时）

### 访客边界

**Guest（访客）**:
未登记邮箱的使用者。可单路生成 + Preview；不落库；无项目列表；无赛马；无自配模型配置入口。
_Avoid_: GuestSession（不引入为领域实体）
