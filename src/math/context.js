/**
 * 公式上下文:负责"哪个元素交给哪个结构类"以及递归。
 *
 * 这样 `structures/*` 里的类只需要管自己那一亩地,不用关心遍历。
 */

import { M } from '../ooxml/ns.js'
import { 文本转LaTeX } from './latex.js'
import { 建注册表 } from './structure.js'

import { 分式 } from './structures/fraction.js'
import { 上下标 } from './structures/script.js'
import { 根式 } from './structures/radical.js'
import { 求和积分 } from './structures/nary.js'
import { 定界符, } from './structures/delimiter.js'
import { 函数 } from './structures/func.js'
import { 极限 } from './structures/limit.js'
import { 矩阵 } from './structures/matrix.js'
import { 方程组 } from './structures/eqarray.js'
import { 重音符, 上下划线, 组字符 } from './structures/accent.js'
import { 边框盒 } from './structures/box.js'
import { 线性降级 } from './structures/misc.js'

/** 纯属性节点:不产出内容 */
const 忽略 = new Set(['rPr', 'ctrlPr', 'argPr', 'fPr', 'radPr', 'naryPr', 'dPr', 'funcPr',
  'limLowPr', 'limUppPr', 'mPr', 'eqArrPr', 'accPr', 'barPr', 'groupChrPr', 'borderBoxPr',
  'phantPr', 'sSupPr', 'sSubPr', 'sSubSupPr', 'sPrePr', 'boxPr', 'oMathParaPr', 'mcPr'])

/** 参数包装:直接出现时透传内容 */
const 参数包装 = new Set(['e', 'num', 'den', 'sub', 'sup', 'deg', 'lim', 'fName', 'mr', 'mc', 'oMath', 'oMathPara'])

export class 公式上下文 {
  constructor () {
    this.公式命名空间 = M
    this.注册表 = 建注册表([
      分式, 上下标, 根式, 求和积分, 定界符, 函数, 极限, 矩阵, 方程组,
      重音符, 上下划线, 组字符, 边框盒
    ])
    this.降级 = new 线性降级()
    this.深度 = 0
  }

  /**
   * 把一个 OMML 节点转成 LaTeX。
   * @param {import('../ooxml/xml.js').XmlNode} 节点
   * @returns {string}
   */
  转子 (节点) {
    if (!节点) return ''
    if (this.深度 > 60) return '[公式嵌套过深]'
    this.深度++
    try {
      const 名 = 节点.名

      if (忽略.has(名)) return ''
      if (名 === 't') return 文本转LaTeX(节点.文本())
      if (名 === 'r') {
        // run:把里面所有 m:t 拼起来
        let s = ''
        for (const c of 节点.子) {
          if (c.名 === 'rPr') continue
          s += c.名 === 't' ? 文本转LaTeX(c.文本()) : this.转子(c)
        }
        return s
      }
      if (参数包装.has(名)) return this.子们(节点)

      const 结构 = this.注册表.get(名)
      if (结构) return 结构.转(节点, this)

      return this.降级.转(节点, this)
    } finally {
      this.深度--
    }
  }

  /** 所有子节点的 LaTeX 拼接 */
  子们 (节点) {
    let s = ''
    for (const c of 节点.子) s += this.转子(c)
    return s
  }
}
