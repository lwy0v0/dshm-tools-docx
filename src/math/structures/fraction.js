/** 分式 `m:f` */ 
import { 公式结构 } from '../structure.js'
import { M as 公式ns } from '../../ooxml/ns.js'

export class 分式 extends 公式结构 {
  static 元素 = ['f']

  转 (节点, 上下文) {
    const 分子 = 节点.找('num', 公式ns)
    const 分母 = 节点.找('den', 公式ns)
    const 类型 = 节点.找('fPr', 公式ns)?.找('type', 公式ns)?.属性('val') || 'bar'
    const 上 = 分子 ? 上下文.转子(分子) : ''
    const 下 = 分母 ? 上下文.转子(分母) : ''
    if (类型 === 'lin') return `${上}/${下}`
    if (类型 === 'noBar') return `\\genfrac{}{}{0pt}{}{${上}}{${下}}`
    return `\\frac{${上}}{${下}}`
  }
}
