/** 边框盒 `m:borderBox`、幻影 `m:phant`、盒 `m:box` */
import { 公式结构 } from '../structure.js'
import { M as 公式ns } from '../../ooxml/ns.js'

export class 边框盒 extends 公式结构 {
  static 元素 = ['borderBox', 'phant', 'box']

  转 (节点, 上下文) {
    const 底 = 节点.找('e', 公式ns)
    const 内容 = 底 ? 上下文.转子(底) : ''
    switch (节点.名) {
      case 'borderBox': return `\\boxed{${内容}}`
      case 'phant': return `\\phantom{${内容}}`
      default: return 内容
    }
  }
}
