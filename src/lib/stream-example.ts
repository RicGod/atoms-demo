/** 延时工具：示例伪流式节奏控制 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 本地示例「思考 + 分块写出」：避免整页瞬间蹦出
 * 步骤：先推阶段性思考文案，再按块追加 HTML 源码
 */
export async function revealHtmlGradually(options: {
  html: string
  label: string
  onThinking: (line: string) => void
  onStage: (stage: string) => void
  onHtml: (partial: string) => void
}): Promise<void> {
  const thinkLines = [
    `先看看「${options.label}」要表达的核心交互。`,
    '规划单文件结构：样式内联、脚本自包含。',
    '准备写入可点击的控件与状态更新逻辑…',
    '开始输出 HTML 源码。',
  ]

  for (const line of thinkLines) {
    options.onStage(line)
    options.onThinking(`${line}\n`)
    await sleep(320)
  }

  const total = options.html.length
  // 步骤：约 36～48 帧写完，体感接近真流式
  const frames = Math.min(48, Math.max(28, Math.ceil(total / 80)))
  const step = Math.max(1, Math.ceil(total / frames))

  for (let i = step; i < total; i += step) {
    const partial = options.html.slice(0, i)
    options.onHtml(partial)
    options.onStage('正在写入页面源码…')
    await sleep(22)
  }
  // 终稿对齐
  options.onHtml(options.html)
  options.onStage('示例页面已就绪')
}
