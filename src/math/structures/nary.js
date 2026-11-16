/** 求和 / 积分 / 连乘 `m:nary` */
import { 公式结构 } from '../structure.js'
import { M as 公式ns } from '../../ooxml/ns.js'
import { 大运算符 } from '../latex.js'

export class 求和积分 extends 公式结构 {
  static 元素 = ['nary']

  转 (节点, 上下文) {
    const pr = 节点.找('naryPr', 公式ns)
    const chr = pr?.找('chr', 公式ns)?.属性('val') || '∫'
    const 命令 = 大运算符[chr] || `\\mathop{${chr}}`
    const 藏上 = pr?.找('supHide', 公式ns)?.属性('val')
    const 藏下 = pr?.找('subHide', 公式ns)?.属性('val')

    const 下节点 = 节点.找('sub', 公式ns)
    const 上节点 = 节点.找('sup', 公式ns)
    const 被积节点 = 节点.找('e', 公式ns)

    const 下 = 下节点 && 藏下 !== '1' ? 上下文.转子(下节点).trim() : ''
    const 上 = 上节点 && 藏上 !== '1' ? 上下文.转子(上节点).trim() : ''
    const 主体 = 被积节点 ? 上下文.转子(被积节点) : ''

    let 头 = 命令
    if (下) 头 += `_{${下}}`
    if (上) 头 += `^{${上}}`
    return 主体 ? `${头} ${主体}` : 头
  }
}
