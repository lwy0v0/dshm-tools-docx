/**
 * 行内片段 → 一行文本。
 *
 * 相邻且格式完全相同的文本片段会合并 —— 否则会产出 `****` 这种畸形标记。
 * 带样式模式下,重复的格式声明用样式类短名(`〔s1〕`),只出现一次的写全。
 */

import { 样式声明 } from '../stylemap.js'

/**
 * @param {object[]} 片段
 * @param {object} [选项]
 */
export function 渲染片段 (片段, 选项 = {}) {
  let s = ''
  let 缓冲 = null
  const 冲出 = () => {
    if (缓冲) { s += 修饰文本(缓冲, 选项); 缓冲 = null }
  }
  for (const f of 片段) {
    if (f.种类 === '文本') {
      if (缓冲 && 同格式(缓冲, f)) { 缓冲 = { ...缓冲, 文本: 缓冲.文本 + f.文本 }; continue }
      冲出()
      缓冲 = { ...f }
      continue
    }
    冲出()
    s += 渲染一个片段(f, 选项)
  }
  冲出()
  return s
}

/** 两个文本片段的格式是否一致(合并用) */
function 同格式 (a, b) {
  const 键 = ['粗体', '斜体', '删除线', '删除', '上标', '下标', '隐藏', '链接',
    '字号', '颜色', '字体', '高亮', '底纹', '下划线', '下划线类型', '字符版式']
  return 键.every(k => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null))
}

/** 非文本片段 */
function 渲染一个片段 (f, 选项) {
  switch (f.种类) {
    case '文本': return 修饰文本(f, 选项)
    case '图片': return 渲染图片(f)
    case '公式': return f.独立 ? `$$${f.latex}$$` : `$${f.latex}$`
    case '脚注引用': return `[^${f.标号}]`
    case '控件': {
      const 值 = f.值 ? ` = ${f.值}` : ''
      return `〔内容控件:${f.控件类型}${f.标签 ? ` "${f.标签}"` : ''}${值}〕`
    }
    case '文本框': return `〔文本框:${f.文本 || '(空)'}〕`
    case '链接': return f.目标 ? `[${f.文本 || f.目标}](${f.目标})` : (f.文本 || '')
    case '不可得': return `〔不可得:${f.原因}${f.原值 ? ` 原值="${f.原值}"` : ''}〕`
    default: return f.文本 || ''
  }
}

/** 文本片段套上格式标记(带样式模式再加 `〔s1〕` / `〔样式:…〕` 前缀) */
function 修饰文本 (f, 选项 = {}) {
  if (!f.文本) return ''
  if (f.隐藏) return ''

  // 首尾空白挪到标记外面,否则 `**粗体 **` 这种会渲染坏
  const 前 = /^\s*/.exec(f.文本)[0]
  const 后 = /\s*$/.exec(f.文本)[0]
  let 核心 = f.文本.slice(前.length, f.文本.length - 后.length)
  if (!核心) return f.文本

  if (f.上标) 核心 = `^{${核心}}`
  if (f.下标) 核心 = `_{${核心}}`
  if (f.删除线 || f.删除) 核心 = `~~${核心}~~`
  if (f.斜体) 核心 = `*${核心}*`
  if (f.粗体) 核心 = `**${核心}**`
  if (f.链接) 核心 = `[${核心}](${f.链接})`

  const 注释 = 选项.带样式 ? 样式注释(f, 选项) : ''
  return `${前}${注释}${核心}${后}`
}

/** 样式注释:收进样式表的用短类名,其余写全 */
function 样式注释 (f, 选项 = {}) {
  const 声明 = 样式声明(f)
  if (!声明) return ''
  const 类 = 选项.样式类?.get(声明)
  return 类 ? `〔${类}〕` : `〔样式:${声明}〕`
}

/** 图片:相对引用 + 一行机器可读注释 */
function 渲染图片 (f) {
  if (!f.路径) {
    const 原因 = f.位置 || '图片未导出'
    return `〔图片未导出:${原因}${f.替代文字 ? ` 替代文字="${f.替代文字}"` : ''}〕`
  }
  const alt = (f.替代文字 || '').replace(/[\[\]]/g, '')
  const 行 = `![${alt}](${f.路径})`
  const 元 = [
    `image: ${f.路径}`,
    f.宽 && f.高 ? `${f.宽}x${f.高}` : '',
    f.格式 || '',
    f.浮动 ? '浮动' : '',
    f.替代文字 ? `alt="${f.替代文字}"` : ''
  ].filter(Boolean).join(' | ')
  return `${行}\n<!-- ${元} -->`
}
