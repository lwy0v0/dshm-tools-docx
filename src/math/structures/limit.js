/** 上下限 `m:limLow` `m:limUpp` */
import { 公式结构 } from '../structure.js'
import { M as 公式ns } from '../../ooxml/ns.js'

export class 极限 extends 公式结构 {
  static 元素 = ['limLow', 'limUpp']

  转 (节点, 上下文) {
    const 底 = 节点.找('e', 公式ns)
    const 限 = 节点.找('lim', 公式ns)
    const 底文 = 底 ? 上下文.转子(底) : ''
    const 限文 = 限 ? 上下文.转子(限).trim() : ''
    if (!限文) return 底文
    if (节点.名 === 'limUpp') return `\\overset{${限文}}{${底文}}`
    return `\\underset{${限文}}{${底文}}`
  }
}
