/**
 * 块 → Markdown 行。
 *
 * 每种块一个 case;新增一类内容只在这里加一行,解析层不用动。
 */

import { 渲染片段 } from './inline.js'
import { 渲染表格 } from './table.js'

/**
 * @param {object[]} 块们
 * @param {object} [选项]
 * @returns {string[]}
 */
export function 渲染块 (块们, 选项 = {}) {
  const 行 = []
  for (const 块 of 块们) 行.push(...渲染一个块(块, 选项))
  return 行
}

function 渲染一个块 (块, 选项) {
  switch (块.类型) {
    case '标题':
      return [`${'#'.repeat(Math.min(6, 块.级别))} ${渲染片段(块.片段, 选项)}`, '']
    case '段落':
      return [渲染片段(块.片段, 选项), '']
    case '列表':
      return [`${'  '.repeat(块.层级)}${块.无序 ? '-' : (块.标签 || '-')} ${渲染片段(块.片段, 选项)}`]
    case '表格':
      return 渲染表格(块, 选项)
    case '分节':
      return [`> 〔分节:${块.描述}〕`, '']
    case '内容控件':
      return [`〔内容控件:${块.控件类型}${块.标签 ? ` "${块.标签}"` : ''}${块.值 ? ` = ${块.值}` : ''}〕`, '']
    case '文本框':
      return ['〔文本框〕', ...缩进(渲染块(块.块, 选项)), '']
    case '修订区': {
      const 头 = `〔修订·${块.修改类型}${块.作者 ? ` · ${块.作者}` : ''}${块.时间 ? ` · ${块.时间}` : ''}〕`
      return [头, ...缩进(渲染块(块.块, 选项)), '']
    }
    case '页眉页脚':
      return [`## 〔${块.位置}${块.作用域 && 块.作用域 !== '默认' ? `·${块.作用域}` : ''}〕`, ...渲染块(块.块, 选项), '']
    case '注释区': {
      const 头 = 块.注型 === '脚注' ? '## 脚注' : '## 尾注'
      const 行 = [头, '']
      for (const 项 of 块.项) 行.push(`[^${项.标号}]: ${纯文本(项.块, 选项)}`)
      行.push('')
      return 行
    }
    case '批注区': {
      const 行 = ['## 批注', '']
      for (const 项 of 块.项) {
        const 尾 = [项.回复于 ? '回复' : '', 项.已解决 ? '已解决' : ''].filter(Boolean).join('·')
        行.push(`- **[${项.id}] ${项.作者 || '匿名'}${项.时间 ? ` · ${项.时间}` : ''}**${尾 ? `(${尾})` : ''}:${纯文本(项.块, 选项)}`)
      }
      行.push('')
      return 行
    }
    case '图表':
      return 渲染图表(块)
    case '智能图形': {
      if (!块.文本.length) return [`〔SmartArt:${块.说明 || '无可读文字'}〕`, '']
      return ['〔SmartArt〕', ...块.文本.map(t => `- ${t}`), '']
    }
    case '嵌入对象':
      return [`〔嵌入对象:${块.说明}${块.程序 ? `(${块.程序})` : ''}〕`, '']
    case '不可得':
      return [`〔不可得:${块.原因}${块.原值 ? ` 原值="${块.原值}"` : ''}〕`, '']
    default:
      return [`〔未识别块:${块.类型}〕`, '']
  }
}

/** 图表:类型 + 系列数据表 */
function 渲染图表 (块) {
  const 行 = [`〔图表:${块.类型名 || '未知'}${块.说明 ? ` · ${块.说明}` : ''}〕`, '']
  const 系列 = 块.系列 || []
  if (!系列.length) return 行.slice(0, 1).concat('')
  const 分类 = 系列.reduce(
    (a, b) => ((b.分类?.length || 0) > (a.分类?.length || 0) ? b : a),
    { 分类: [] }
  ).分类
  const 表头 = ['分类', ...系列.map((s, i) => s.名 || `系列${i + 1}`)]
  行.push(`| ${表头.join(' | ')} |`)
  行.push(`| ${表头.map(() => '---').join(' | ')} |`)
  for (let i = 0; i < 分类.length; i++) {
    行.push(`| ${分类[i] ?? ''} | ${系列.map(s => s.数值[i] ?? '').join(' | ')} |`)
  }
  行.push('')
  return 行
}

/** 块数组 → 纯文本(表格单元格 / 批注 / 注文里用) */
export function 纯文本 (块们, 选项 = {}) {
  let s = ''
  for (const 块 of 块们) {
    switch (块.类型) {
      case '表格': {
        for (const 行项 of 块.行) {
          s += 行项.格.map(c => 纯文本(c.块, 选项)).filter(Boolean).join(' / ')
          s += ' ⏎ '
        }
        break
      }
      case '标题':
        s += `${'#'.repeat(Math.min(6, 块.级别))} ${渲染片段(块.片段, 选项)} `
        break
      case '列表':
        s += `${块.无序 ? '-' : (块.标签 || '-')} ${渲染片段(块.片段, 选项)} `
        break
      case '文本框':
      case '修订区':
      case '页眉页脚':
        s += 纯文本(块.块, 选项)
        break
      case '注释区':
        for (const 项 of 块.项) s += `[^${项.标号}] ${纯文本(项.块, 选项)} `
        break
      case '批注区':
        for (const 项 of 块.项) s += `[批注 ${项.作者}] ${纯文本(项.块, 选项)} `
        break
      case '智能图形':
        s += 块.文本.join(';')
        break
      case '图表':
        s += `〔图表:${块.类型名 || '未知'}〕`
        break
      case '嵌入对象':
        s += `〔嵌入对象:${块.说明}〕`
        break
      case '不可得':
        s += `〔不可得:${块.原因}〕`
        break
      default:
        if (块.片段) s += 渲染片段(块.片段, 选项)
        break
    }
  }
  return s.trim()
}

/** 每行前加两个空格(缩进块) */
function 缩进 (行们) {
  return 行们.filter(l => l !== '').map(l => '  ' + l)
}
