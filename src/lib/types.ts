import type { GenerationMode, TaskSource } from '../../shared/constants'

export type { GenerationMode, TaskSource }

export type TaskSummary = {
  id: string
  email: string
  title: string
  prompt: string
  generationMode: GenerationMode
  source: TaskSource
  createdAt: string
  updatedAt: string
  hasHtml?: boolean
}

/** 持久化的对话条目（与工作区 ChatItem 对齐） */
export type PersistedChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'version'; id: string; n: number; label: string }
  | { kind: 'error'; id: string; text: string }

export type TaskDetail = TaskSummary & {
  html: string
  /** 项目对话记录；旧数据可能为空数组 */
  chat: PersistedChatItem[]
}

/** 单条自配连接参数（生成时使用） */
export type ByokConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

/** 本机保存的一条模型配置（可多条、可选用） */
export type ByokProfile = ByokConfig & {
  id: string
  /** 列表展示名，便于区分多条配置 */
  name: string
  /** 平台预置：展示在列表中，但不可编辑/删除 */
  builtin?: boolean
}

/** localStorage 中的自配模型仓库 */
export type ByokStore = {
  profiles: ByokProfile[]
  /** 当前选用的配置 id */
  activeId: string | null
}

/** 登录用户默认平台模型（走服务端百炼，非浏览器自配 Key） */
export const BUILTIN_FLASH_PROFILE_ID = 'builtin:qwen3.8-flash'
export const BUILTIN_FLASH_MODEL = 'qwen3.8-flash'

/** 平台预置模型清单（列表展示、不可编辑删除） */
export const BUILTIN_PLATFORM_MODELS = [
  { id: BUILTIN_FLASH_PROFILE_ID, model: BUILTIN_FLASH_MODEL },
] as const

export const BYOK_STORAGE_KEY = 'mini-atoms-byok'
export const EMAIL_STORAGE_KEY = 'mini-atoms-email'
/** 工作区左侧对话列宽度（px） */
export const CHAT_WIDTH_STORAGE_KEY = 'mini-atoms-chat-width'

export const PRESETS = [
  { id: 'counter', label: '计数器', path: '/presets/counter.html' },
  { id: 'todo', label: '待办', path: '/presets/todo.html' },
  { id: 'timer', label: '计时器', path: '/presets/timer.html' },
  { id: 'quiz', label: '小测', path: '/presets/quiz.html' },
] as const
