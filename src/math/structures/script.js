/** 上下标 `m:sSup` `m:sSub` `m:sSubSup` `m:sPre` */
import { 公式结构 } from '../structure.js'
import { M as 公式ns } from '../../ooxml/ns.js'

function 取 (节点, 名, 上下文) {
  const 子 = 节点.找(名, 公式ns)
  return 子 ? 上下文.转子(子) : ''
}

/** 底数需要加括号时补一层 */
function 括 (变元) {
  if (!变元) return '{}'
  if (/^[A-Za-z0-9]$/.test(变元)) return 变元
  return `{${变元}}`
}

export class 上下标 extends 公式结构 {
  static 元素 = ['sSup', 'sSub', 'sSubSup', 'sPre']

  转 (节点, 上下文) {
    const 底 = 取(节点, 'e', 上下文)
    const 上 = 取(节点, 'sup', 上下文)
    const 下 = 取(节点, 'sub', 上下文)

    switch (节点.名) {
      case 'sSup': return `${括(底)}^{${上}}`
      case 'sSub': return `${括(底)}_{${下}}`
      case 'sSubSup': return `${括(底)}_{${下}}^{${上}}`
      case 'sPre': return `{}_{${下}}^{${上}}${底}`
      default: return 底
    }
  }
}
