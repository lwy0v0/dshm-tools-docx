/** 方程组 / 多行公式 `m:eqArr` */
import { 公式结构 } from '../structure.js'
import { M as 公式ns } from '../../ooxml/ns.js'

export class 方程组 extends 公式结构 {
  static 元素 = ['eqArr']

  转 (节点, 上下文) {
    const 行 = 节点.找全部('e', 公式ns).map(e => 上下文.转子(e).trim())
    if (!行.length) return ''
    if (行.length === 1) return 行[0]
    return `\\begin{aligned} ${行.join(' \\\\ ')} \\end{aligned}`
  }
}
