/**
 * 公式入口:OMML 节点 → LaTeX。
 *
 * 用法:
 *   const 公式 = new 公式转换()
 *   公式.转(oMath节点)   // → '\\frac{a}{b}'
 */

import { M } from '../ooxml/ns.js'
import { 公式上下文 } from './context.js'

export class 公式转换 {
  constructor () {
    this.上下文 = new 公式上下文()
  }

  /**
   * @param {import('../ooxml/xml.js').XmlNode} 节点 `m:oMath` 或 `m:oMathPara`
   * @returns {string}
   */
  转 (节点) {
    if (!节点) return ''
    let 体 = 节点
    if (节点.名 === 'oMathPara') {
      体 = 节点.找('oMath', M) || 节点
    }
    const latex = this.上下文.转子(体).trim()
    return latex
  }
}

/** 这个节点是不是公式 */
export function 是公式 (节点) {
  return !!节点 && (节点.名 === 'oMath' || 节点.名 === 'oMathPara') && M.includes(节点.uri)
}
