/**
 * 行内特殊字符:制表符、换行、符号、软连字符、拼音、不间断空格。
 *
 * 这一层的职责只有一件:**把"不是普通字母"的字符变成人能看懂、模型能用的文本**。
 */

import { W } from '../../ooxml/ns.js'
import { inNs } from '../../ooxml/ns.js'

/**
 * 处理 `w:r` 里的特殊子节点。
 * @param {import('../../ooxml/xml.js').XmlNode} 节点
 * @returns {string|null} 文本;返回 null 表示"这个节点不归我管"
 */
export function 特殊文本 (节点) {
  if (inNs(节点, W)) {
    switch (节点.名) {
      case 'tab': return '\t'
      case 'br': {
        const 类型 = 节点.属性('type') || 'textWrapping'
        // 分页/分栏是**版面**,不是文字:不进正文(段落上另记 `分页` 标记),免得污染标题行
        if (类型 === 'page') return ''
        if (类型 === 'column') return ''
        return '\n'
      }
      case 'cr': return '\n'
      case 'noBreakHyphen': return '‑'
      case 'softHyphen': return ''
      case 'noBreakSpace': return '\u00A0'
      case 'sym': {
        const 字体 = 节点.属性('font') || ''
        const 码 = 节点.属性('char') || ''
        return `[符号 ${字体}/${码}]`
      }
      case 'ruby': return 拼音文本(节点)
      case 'lastRenderedPageBreak': return ''
      case 'proofErr': return ''
      case 'dayShort': case 'monthShort': case 'yearShort': return ''
      default: return null
    }
  }
  return null
}

/** `w:ruby`:汉字 + 拼音 */
function 拼音文本 (ruby) {
  const 基 = ruby.找('rubyBase', W)?.全部文本() || ''
  const 音 = ruby.找('rt', W)?.全部文本() || ''
  if (!音) return 基
  return `${基}(${音})`
}
