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

export type TaskDetail = TaskSummary & {
  html: string
}

export type ByokConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

export const BYOK_STORAGE_KEY = 'mini-atoms-byok'
export const EMAIL_STORAGE_KEY = 'mini-atoms-email'

export const PRESETS = [
  { id: 'counter', label: '计数器', path: '/presets/counter.html' },
  { id: 'todo', label: '待办', path: '/presets/todo.html' },
  { id: 'timer', label: '计时器', path: '/presets/timer.html' },
  { id: 'quiz', label: '小测', path: '/presets/quiz.html' },
] as const
