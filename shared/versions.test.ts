import { describe, expect, it } from 'vitest'
import {
  appendVersionSnapshot,
  exportFilename,
  migrateVersionsIfNeeded,
  normalizeVersions,
  sanitizeChangeSummary,
  VERSION_MAX_SNAPSHOTS,
  versionCardLabel,
} from './versions.js'

describe('versions helpers', () => {
  it('sanitizeChangeSummary 清洗并截断模型摘要', () => {
    const s = sanitizeChangeSummary('「摘要：把按钮改成红色并加大」', 'fallback')
    expect(s.includes('摘要')).toBe(false)
    expect(s.includes('把按钮')).toBe(true)
  })

  it('versionCardLabel 使用改动摘要', () => {
    expect(versionCardLabel(2, '按钮改为霓虹红')).toBe(
      '版本 2 · 按钮改为霓虹红',
    )
  })

  it('appendVersionSnapshot 线性递增并写入摘要', () => {
    const a = appendVersionSnapshot({
      versions: [],
      prompt: '第一版',
      changeSummary: '新建计数器页面',
      html: '<html>1</html>',
      now: '2026-01-01T00:00:00.000Z',
    })
    expect(a.currentVersionN).toBe(1)
    expect(a.versions[0]?.promptSummary).toBe('新建计数器页面')
    const b = appendVersionSnapshot({
      versions: a.versions,
      prompt: '第二版',
      changeSummary: '把按钮改成红色',
      html: '<html>2</html>',
      now: '2026-01-01T00:01:00.000Z',
    })
    expect(b.currentVersionN).toBe(2)
    expect(b.versions).toHaveLength(2)
  })

  it('淘汰最旧且保留 Current', () => {
    const many = Array.from({ length: VERSION_MAX_SNAPSHOTS + 3 }, (_, i) => ({
      n: i + 1,
      promptSummary: `p${i + 1}`,
      html: `<html>${i + 1}</html>`,
      createdAt: '2026-01-01T00:00:00.000Z',
    }))
    // Current 停在很老的 v1
    const pruned = normalizeVersions(many, 1)
    expect(pruned.length).toBeLessThanOrEqual(VERSION_MAX_SNAPSHOTS)
    expect(pruned.some((v) => v.n === 1)).toBe(true)
  })

  it('旧 html 惰性迁移为 Version 1', () => {
    const m = migrateVersionsIfNeeded({
      html: '<html>old</html>',
      prompt: '旧项目',
      versions: [],
      currentVersionN: 0,
    })
    expect(m.currentVersionN).toBe(1)
    expect(m.versions[0]?.html).toContain('old')
  })

  it('exportFilename 清理非法字符', () => {
    expect(exportFilename('霓虹/按钮', 3)).toBe('霓虹_按钮-v3.html')
  })
})
