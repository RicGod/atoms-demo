/** 代码区行级 diff：用于迭代后「只看改了什么」的视觉呈现 */

export type DiffLine = {
  type: 'same' | 'add' | 'del' | 'skip'
  text: string
}

/**
 * 行级 LCS diff；规模过大时退化为「整页视为新增」以免卡死
 * 步骤：只服务展示，不追求最优 diff 算法
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.replace(/\r\n/g, '\n').split('\n')
  const b = after.replace(/\r\n/g, '\n').split('\n')
  if (a.length * b.length > 1_500_000) {
    return b.map((text) => ({ type: 'add' as const, text }))
  }

  const n = a.length
  const m = b.length
  const dp: Uint16Array[] = Array.from(
    { length: n + 1 },
    () => new Uint16Array(m + 1),
  )
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? (dp[i + 1][j + 1] + 1) as number
          : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: a[i] })
      i++
    } else {
      out.push({ type: 'add', text: b[j] })
      j++
    }
  }
  while (i < n) {
    out.push({ type: 'del', text: a[i++] })
  }
  while (j < m) {
    out.push({ type: 'add', text: b[j++] })
  }
  return out
}

/** 折叠大段未改动行，突出变更（视觉上像「只改了一部分」） */
export function collapseUnchanged(
  lines: DiffLine[],
  keepContext = 2,
): DiffLine[] {
  const changed = lines.map(
    (l) => l.type === 'add' || l.type === 'del',
  )
  const keep = new Array(lines.length).fill(false)
  for (let i = 0; i < lines.length; i++) {
    if (!changed[i]) continue
    for (
      let k = Math.max(0, i - keepContext);
      k <= Math.min(lines.length - 1, i + keepContext);
      k++
    ) {
      keep[k] = true
    }
  }
  // 步骤：若几乎整页都变了，就别折叠，直接全量对照
  const keepCount = keep.filter(Boolean).length
  if (keepCount > lines.length * 0.85) return lines

  const out: DiffLine[] = []
  let i = 0
  while (i < lines.length) {
    if (keep[i]) {
      out.push(lines[i])
      i++
      continue
    }
    let j = i
    while (j < lines.length && !keep[j]) j++
    out.push({ type: 'skip', text: `… 省略 ${j - i} 行未改动 …` })
    i = j
  }
  return out
}
