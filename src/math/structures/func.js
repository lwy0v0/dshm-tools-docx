/** 函数 `m:func` */
import { 公式结构 } from '../structure.js'
import { M as 公式ns } from '../../ooxml/ns.js'

export class 函数 extends 公式结构 {
  static 元素 = ['func']

  转 (节点, 上下文) {
    const 名节点 = 节点.找('fName', 公式ns)
    const 参节点 = 节点.找('e', 公式ns)
    const 名 = 名节点 ? 上下文.转子(名节点).trim() : ''
    const 参 = 参节点 ? 上下文.转子(参节点) : ''

    // 常见的函数名加反斜杠,让 LaTeX 正常排版;不认识的保持原样
    const 常用 = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan',
      'sinh', 'cosh', 'tanh', 'log', 'ln', 'lg', 'exp', 'max', 'min', 'sup', 'inf', 'lim',
      'det', 'dim', 'ker', 'deg', 'gcd', 'Pr']
    const 规范名 = 常用.includes(名) ? `\\${名}` : 名
    return `${规范名}{${参}}`
  }
}
