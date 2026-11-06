# 内置 HTML 生成 · ui-ux-pro-max 规范

> 本文件与 `shared/ui-ux-skill.ts` 同源说明；运行时以 TS 常量为准注入 system prompt。
> 检索来源：`python …/ui-ux-pro-max/scripts/search.py "AI tool modern tech minimal light" --design-system`

## 默认方向

- 产品：AI 生成网页 / 工具类落地页
- 风格：AI-Native + Minimalism & Swiss + Tech（浅色默认）
- 字体：Space Grotesk（标题）/ DM Sans（正文）/ JetBrains Mono（数字与代码）
- 版式：Hero → 演示/功能 → CTA

## 科技感（克制）

- 细边框 / hairline、微渐变、极淡光感
- 等宽数字点缀；150–300ms 过渡
- 禁止霓虹紫大面积、厚重 glow、emoji 当图标

## 要点清单

- [ ] 浅色背景、正文对比 ≥ 4.5:1
- [ ] 无衬线字体层级清晰，区块间距约 1.5–2rem
- [ ] 图标用内联 SVG，禁止 emoji 当图标
- [ ] hover / focus / reduced-motion
- [ ] 必须有真实交互，禁止空洞占位页
