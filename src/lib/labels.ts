import type { GenerationMode } from './types'

/** 将内部 generationMode 映射为评委可见的产品话术（禁止暴露工程术语） */
export function modeBadgeLabel(mode: GenerationMode | null): string | null {
  if (!mode) return null
  if (mode === 'byok') return '自配'
  if (mode === 'mock') return '示例'
  // builtin → 云端，不展示 builtin 字样
  return '云端'
}

/** 生成完成态状态栏文案 */
export function doneStatusLabel(mode: GenerationMode): string {
  if (mode === 'byok') return '自配模型生成完成'
  if (mode === 'mock') return '示例体验已就绪'
  return '生成完成'
}
