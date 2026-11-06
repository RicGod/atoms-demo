/** 前端剥离 markdown 围栏，尽量得到可预览 HTML */
export function extractHtmlClient(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:html)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  if (trimmed.includes('<html') || trimmed.includes('<!DOCTYPE')) return trimmed
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Generated</title></head><body>${trimmed}</body></html>`
}
