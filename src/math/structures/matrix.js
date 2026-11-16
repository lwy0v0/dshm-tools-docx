/** 矩阵 `m:m`(行 `m:mr`,单元格 `m:e`) */
import { 公式结构 } from '../structure.js'
import { M as 公式ns } from '../../ooxml/ns.js'

export class 矩阵 extends 公式结构 {
  static 元素 = ['m']

  转 (节点, 上下文) {
    const 行们 = 节点.找全部('mr', 公式ns)
    if (!行们.length) return ''
    const 行文本 = 行们.map(行 => {
      const 格 = 行.找全部('e', 公式ns).map(e => 上下文.转子(e))
      return 格.join(' & ')
    })
    return `\\begin{matrix} ${行文本.join(' \\\\ ')} \\end{matrix}`
  }
}
