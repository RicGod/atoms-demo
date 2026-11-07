# Mini Atoms Demo

用户用一句话描述想法，系统生成可交互的单文件 HTML，即时预览；已登记邮箱的用户可在「项目」（对内 Task）内多轮对话迭代并持久化回看。已登录用户可选对同一 Prompt 并行两路生成后择优（赛马）。本词汇表只定义领域语言，不含技术实现细节。

## Language

### 身份与任务

**User (Email)**:
以邮箱字符串标识的使用者身份；「登录」仅指提交邮箱登记（无验证码、无 OIDC）。同一邮箱下可拥有多个 Task。
_Avoid_: Account, Profile, OAuth user, 账号体系（暗示完整用户系统时）

**Task**:
按邮箱隔离的持久化聚合：一次创作工作单元，内含最近一轮 Prompt 摘要、当前选定 Artifact（覆盖写）、**Chat Timeline（对话时间线）**，以及必要元数据。进入保存路径前必须新建或打开 Task。API / 规格 / 内部代码仍称 Task。
_Avoid_: Session, Workspace, Document（过宽或与 Artifact 混淆）

**Project（项目）**:
**Task 的对外 UI 别名**（1:1）。登录后「项目列表」= Task 列表；进入「项目」= 打开该 Task（左对话 + 右 Preview/代码）。禁止把 Project 建成第二套落库聚合，禁止「一个 Project 含多个 Task」的容器语义。
_Avoid_: Project folder, Workspace container, 多 Task 文件夹

**Creation**:
Task 的当前已保存产物之语义别名（最近一轮 Prompt 摘要 + **当前 Version** 对应的 Artifact + 对话时间线等），**不是**独立于 Task 的第二套持久化聚合。回看与列表以 Task 为准。
_Avoid_: 把 Creation 当作与 Task 并列的唯一 DB 聚合

### 输入与产物

**Prompt**:
用户提交的一句自然语言描述，是一次生成或迭代流程的输入意图。持久化时 Task 上的 Prompt 字段仅表示**最近一轮**需求摘要；完整发言历史见 Chat Timeline。Version 卡片上的「当轮修改内容」优先取自**模型另写的一句短摘要**；摘要失败时回退为该轮 Prompt 截断。
_Avoid_: Idea, Query, Instruction, 想法（口语可说「想法」，书面与模型统一用 Prompt）

**Artifact**:
一次生成流程产出的、可独立运行的**单文件 HTML 文档**（样式与脚本自包含，一份文件即可在浏览器里打开跑）。每个 **Version** 持有一份完整 Artifact 快照；Task 的「当前 Artifact」= **当前 Version** 那份。MVP **不**引入多文件包 / 真文件树。
_Avoid_: Page, App, Site, Document, 页面（泛指）；ArtifactBundle（多文件包，Post-MVP）

### 会话呈现

**Preview**:
当前会话中用于展示**当前 Version** 之 Artifact 的即时预览视图；本身不是持久化实体。未登记邮箱也可 Preview，但不得持久化、无 Version 历史。
_Avoid_: Render, Sandbox view, Demo（与「产品演示」混淆时）

**Workspace（工作区）**:
打开项目后的界面编排口语：左对话区 + 右 Preview / 代码切换。**不是**领域实体，不落库。代码页可浏览 Version 历史并触发回滚。
_Avoid_: 把 Workspace 写成第二套持久化聚合

**Chat Timeline（对话时间线）**:
Task 内可持久化的对话序列，条目为用户发言、助手回复、Version 里程碑，以及 **System Note（系统说明）**。回滚**不改写、不删除**已有时间线条目；回滚成功后追加一条 System Note。不含流式思考过程。
_Avoid_: chat_json（实现列名）, Conversation（易与「一次聊天会话」混淆时）, History（过宽）

**System Note（系统说明）**:
对话时间线上的非对话条目，用于记录工作区重要状态变更（例如「已回滚到版本 K」）。可持久化；不是用户 Prompt，也不送给模型当 messages。
_Avoid_: assistant 冒充系统消息；Toast-only（仅闪一下不落时间线）

**Regenerate / 对话式迭代**:
在同一项目内多轮 Prompt：结合对话历史与**当前 Artifact**，按本轮需求做**针对性、最小必要**的修改；模型仍交付一份**完整可运行的单文件 HTML**；成功后追加新 **Version** 快照并成为当前 Version。工作区迭代呈现 MAY 用「相对上一版」的变更对照（增删高亮、折叠未改行）；该对照**仅 Workspace 呈现、不持久化**，不是领域实体。
_Avoid_: Retry（仅表示网络重试时）, Refresh（仅表示刷新页面时）；AST 补丁；把 Diff/变更对照当成 Artifact 或落库对象

**Version（版本 N）**:
Task 内一次成功生成/择优后的**可恢复 Artifact 快照**（完整单文件 HTML + 序号 N + 本轮改动短摘要）。序号在 Task 内单调递增、**不分支**（回滚后再生成仍分配下一个 N）。对话时间线同步出现对应里程碑卡片（文案形如「版本 N · {改动短摘要}」）。**仅登录且已打开的 Task** 拥有可浏览/回滚的 Version 历史；访客可有装饰卡片语义，但不落历史快照。Task 对快照份数有上限；超出时可丢弃最旧快照的 HTML（时间线卡片仍可保留）。
_Avoid_: 把 Version 仅当作不可恢复的装饰标记；Git 式分支版本树；Checkpoint（实现隐喻）

**Current Version（当前版本）**:
Task 上指向某一 Version 的选择；Preview、代码默认展示、以及导出均针对当前 Version 的 Artifact。回滚 = 把当前 Version 改到历史某一 N，不删除其它 Version。
_Avoid_: HEAD, tip（Git 隐喻外溢时）

**Rollback（回滚）**:
将 Current Version 切换到 Task 内已有的某一历史 Version；只改当前指针与当前 Artifact，不新建生成轮次；成功后在 Chat Timeline 追加一条 System Note。之后若再迭代，以该 Version 的 Artifact 为基底并线性追加新 N。
_Avoid_: Undo（易与编辑器撤销混淆）, Revert commit

**Export（导出）**:
把当前可下载的 Artifact 存为本地单文件（文件名可用「项目标题-v{N}.html」）。登录用户导出 **Current Version**；访客导出当次会话内存中的那份 HTML（不落库、无 Version 历史）。不是分享直链，不是领域聚合。
_Avoid_: Publish, Share link, 公开作品页

### 赛马

**Horse Race**:
对同一 Prompt 并行发起两路内置生成（固定不同内置模型）、得到两份候选 Artifact、由用户择优的流程（无自动打分）。**仅登录用户**可用；访客禁用赛马。核心闭环不稳时可整段砍掉。
_Avoid_: A/B Test, Tournament, Battle, Comparison（无「并行生成」语义时）；访客赛马

**Candidate**:
Horse Race 中一路生成得到的 Artifact（尚未被选为优胜）。
_Avoid_: Variant, Option, Runner（口语可说 runner-up，模型用 Candidate）

**Winner**:
用户在 Candidate 中选定的那一份 Artifact；选定后成为当前 Preview，并在已打开的 Task 中落成新的 **Version**（source = horse-race）。
_Avoid_: Score winner, Champion, Best（暗示自动打分时）

### 生成来源（元数据语义）

**Generation Mode**:
一次生成所采用的来源语义：内置 LLM、浏览器自配模型（BYOK），或仅访客可用的 mock / 预置静态示例。作为 Task/生成元数据保留；**工作区对话区不强制展示角标**（自配入口在「配置模型」等处）。自配模型配置 UI **仅登录后**展示。
_Avoid_: Environment, Fallback flag（纯技术字段名）；强制在对话输入条旁贴「自配/云端」角标

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

**Preset（预置示例）**:
一份事先写好的单文件 HTML，访客可把它当作当前 Preview 打开。它不是 Task，也不是 Project。
_Avoid_: 项目, Demo Project, 示例项目
