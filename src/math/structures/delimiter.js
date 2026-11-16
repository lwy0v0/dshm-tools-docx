/** 定界符 / 括号 `m:d` */
import { 公式结构 } from '../structure.js'
import { M as 公式ns } from '../../ooxml/ns.js'
import { 定界符 as 定界符表 } from '../latex.js'

export class 定界符 extends 公式结构 {
  static 元素 = ['d']

  转 (节点, 上下文) {
    const pr = 节点.找('dPr', 公式ns)
    const 左 = pr?.找('begChr', 公式ns)?.属性('val') ?? '('
    const 右 = pr?.找('endChr', 公式ns)?.属性('val') ?? ')'
    const 分隔 = pr?.找('sepChr', 公式ns)?.属性('val') ?? '|'

    const 项 = 节点.找全部('e', 公式ns).map(e => 上下文.转子(e))
    const 内容 = 项.join(` \\middle${定界符表[分隔] || 分隔} `)
    return `\\left${定界符表[左] || 左} ${内容} \\right${定界符表[右] || 右}`
  }
}
