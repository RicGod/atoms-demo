# Task 内线性 Version 快照（可回滚）

原先 OpenSpec / Glossary 明确「Version 仅装饰、Artifact 覆盖写、不做版本树」。笔试演示需要「代码页看历史 + 回滚 + 导出当前版」，因此改为：登录 Task 内保存有序 Version 快照（完整 HTML + 改动短摘要），Current Version 指针决定 Preview/默认代码/导出；回滚只改指针并追加 System Note，再生成则线性追加 N+1（不分支）；快照上限 20、淘汰最旧且永不删 Current。版本卡文案优先用模型另写的一句摘要（失败回退 Prompt 截断）。放弃真·Git 分支树与「永久只留一份 HTML」，以免复杂度回到完整 Atoms，同时仍满足可回看与导出。
