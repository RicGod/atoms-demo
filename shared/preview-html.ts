/**
 * Preview iframe 预处理：在不放开 allow-same-origin 的前提下，
 * 为沙箱补齐 localStorage / sessionStorage，避免生成页一访问存储就抛错导致整页脚本中断。
 */

/** 注入到预览文档最前的内存 Storage shim（仅预览用，不进导出文件） */
const PREVIEW_STORAGE_SHIM = `<script data-atoms-preview-shim="1">
(function () {
  // 步骤：沙箱无 same-origin 时读写 localStorage 会 SecurityError，用内存表顶上
  function makeStore() {
    var mem = Object.create(null);
    return {
      getItem: function (k) {
        k = String(k);
        return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
      },
      setItem: function (k, v) {
        mem[String(k)] = String(v);
      },
      removeItem: function (k) {
        delete mem[String(k)];
      },
      clear: function () {
        mem = Object.create(null);
      },
      key: function (i) {
        return Object.keys(mem)[i] || null;
      },
      get length() {
        return Object.keys(mem).length;
      },
    };
  }
  function broken(name) {
    try {
      var s = window[name];
      if (!s) return true;
      s.setItem('__atoms_probe__', '1');
      s.removeItem('__atoms_probe__');
      return false;
    } catch (e) {
      return true;
    }
  }
  try {
    if (broken('localStorage')) {
      Object.defineProperty(window, 'localStorage', {
        value: makeStore(),
        configurable: true,
      });
    }
  } catch (e) {}
  try {
    if (broken('sessionStorage')) {
      Object.defineProperty(window, 'sessionStorage', {
        value: makeStore(),
        configurable: true,
      });
    }
  } catch (e) {}
})();
</script>`

/**
 * 把 Storage shim 插到 HTML 里，保证早于业务脚本执行
 * 导出下载仍用原始 html，不要走本函数
 */
export function preparePreviewHtml(html: string): string {
  const raw = html ?? ''
  if (!raw.trim()) return raw
  // 步骤：避免重复注入（React 重渲染 / 多处预览）
  if (raw.includes('data-atoms-preview-shim')) return raw

  const head = raw.match(/<head[^>]*>/i)
  if (head && head.index != null) {
    const at = head.index + head[0].length
    return raw.slice(0, at) + PREVIEW_STORAGE_SHIM + raw.slice(at)
  }

  const htmlTag = raw.match(/<html[^>]*>/i)
  if (htmlTag && htmlTag.index != null) {
    const at = htmlTag.index + htmlTag[0].length
    return (
      raw.slice(0, at) +
      `<head>${PREVIEW_STORAGE_SHIM}</head>` +
      raw.slice(at)
    )
  }

  return PREVIEW_STORAGE_SHIM + raw
}
