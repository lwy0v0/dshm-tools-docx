/**
 * 表格渲染:能 Markdown 就 Markdown,有合并/嵌套就退 HTML。
 */

import { 纯文本 } from './block.js'

/**
 * @param {object} 块 表格块
 * @param {object} [选项]
 * @returns {string[]} 行
 */
export function 渲染表格 (块, 选项 = {}) {
  if (!块.行.length) return ['〔空表格〕', '']
  const 格内有表 = 块.行.some(行项 => 行项.格.some(格 => 格.块.some(b => b.类型 === '表格')))
  if (块.合并 || 格内有表) return 渲染表格HTML(块, 选项)

  const 行 = []
  const 表头 = 块.行[0].格.map(格 => 纯文本(格.块, 选项).replace(/\|/g, '\\|') || ' ')
  行.push(`| ${表头.join(' | ')} |`)
  行.push(`| ${表头.map(() => '---').join(' | ')} |`)
  for (const 行项 of 块.行.slice(1)) {
    const 格 = 行项.格.map(c => 纯文本(c.块, 选项).replace(/\|/g, '\\|').replace(/\n/g, ' ') || ' ')
    行.push(`| ${格.join(' | ')} |`)
  }
  行.push('')
  return 行
}

/** HTML 兜底(支持 colspan,格内可嵌表) */
export function 渲染表格HTML (块, 选项 = {}) {
  const 行 = ['<table>']
  for (const 行项 of 块.行) {
    行.push('<tr>')
    for (const 格 of 行项.格) {
      const 属性 = []
      if (格.跨列 > 1) 属性.push(`colspan="${格.跨列}"`)
      if (格.纵向 === '延续') continue // 纵向合并的延续格不输出
      const 标签 = 行项.表头 ? 'th' : 'td'
      行.push(`<${标签}${属性.length ? ' ' + 属性.join(' ') : ''}>${单元格内容(格.块, 选项)}</${标签}>`)
    }
    行.push('</tr>')
  }
  行.push('</table>', '')
  return 行
}

/** 单元格内容:嵌套表自己渲染成 HTML,其余走纯文本 */
function 单元格内容 (块们, 选项 = {}) {
  const 部分 = []
  let 文字 = []
  for (const 块 of 块们) {
    if (块.类型 === '表格') {
      if (文字.length) { 部分.push(文字.join(' ')); 文字 = [] }
      部分.push(渲染表格HTML(块, 选项).filter(l => l !== '').join('\n'))
    } else {
      文字.push(纯文本([块], 选项))
    }
  }
  if (文字.length) 部分.push(文字.join(' '))
  return 部分.filter(Boolean).join('\n')
}
