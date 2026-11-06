# Creation 是唯一持久化聚合

> **状态：已由 [ADR-0002](./0002-task-is-durable-aggregate-under-email.md) 取代。**  
> 下文保留为演进记录；实现与规格以 ADR-0002 及当前 GLOSSARY 为准。

Mini Atoms Demo 需要「真实交互 + 持久化」，但笔试时间与范围排除完整版本树、用户体系与自动裁判。当时决定：**唯一写入数据库的领域聚合是 Creation**（Prompt + 选定 Artifact + 元数据）；Preview 仅为会话态；Horse Race 是产生 Winner 的短暂流程，不是独立持久化聚合；不引入 Version、Score、User。

**Considered Options**:
- 每次 Regenerate / 每个 Candidate 都落库成 Version 或 Creation 行 → 实现与回看成本高，超出 MVP
- Horse Race 持久化为 Race 聚合并挂载 Score → 与「用户点选、无自动裁判」冲突
- 仅会话预览、不持久化 → 不满足笔试硬要求

**Consequences**:
- 未保存的 Artifact 刷新即失；Runner-up 是否落库属可选增强，默认可不存
- 回看只能打开 Creation，不能按「版本树」浏览

**Superseded because**（grilling R1–R4 共识）:
- 引入邮箱登记身份与按邮箱隔离的 **Task** 作为持久化聚合
- Creation 退化为 Task 当前已保存产物的语义别名，不再是「唯一 DB 聚合」叙事
- 仍不做 OIDC、版本树、Score 进模型
