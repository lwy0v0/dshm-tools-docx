/** 根式 `m:rad` */
import { 公式结构 } from '../structure.js'
import { M as 公式ns } from '../../ooxml/ns.js'

export class 根式 extends 公式结构 {
  static 元素 = ['rad']

  转 (节点, 上下文) {
    const pr = 节点.找('radPr', 公式ns)
    const 藏次数 = pr?.找('degHide', 公式ns)
    const 次数节点 = 节点.找('deg', 公式ns)
    const 被开方 = 节点.找('e', 公式ns)
    const 内容 = 被开方 ? 上下文.转子(被开方) : ''
    const 次数 = 次数节点 ? 上下文.转子(次数节点).trim() : ''

    const 隐藏 = 藏次数 ? (藏次数.属性('val') ?? '1') !== '0' : !次数
    if (隐藏 || !次数) return `\\sqrt{${内容}}`
    return `\\sqrt[${次数}]{${内容}}`
  }
}
