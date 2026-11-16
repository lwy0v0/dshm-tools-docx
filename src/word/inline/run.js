/**
 * 单个 run(`w:r`)的拆解:文本、特殊字符、图片/绘图、脚注引用、域标记、兼容内容…
 *
 * 它只调用收集器暴露的几个动作(推 / 域 / 读格式 / 遍历),自己不留状态 ——
 * 这样"run 里有什么"和"怎么编排"是两件事,分别放在两个文件里。
 */

import { MC } from '../../ooxml/ns.js'
import { 特殊文本 } from './special.js'

export class 运行解析器 {
  /** @param {import('./runs.js').行内收集器} 收集器 */
  constructor (收集器) {
    this.收集器 = 收集器
  }

  /**
   * @param {import('../../ooxml/xml.js').XmlNode} run
   * @param {object} 上下文
   */
  读 (run, 上下文) {
    const 收集器 = this.收集器
    const 格式 = 收集器.读格式(run.找('rPr'), 上下文)

    for (const 子 of run.子) {
      if (子.名 === 'rPr') continue

      // 特殊字符(制表符/换行/符号/拼音…)优先
      const 特殊 = 特殊文本(子)
      if (特殊 !== null) {
        if (特殊) 收集器.推({ 种类: '文本', 文本: 特殊, ...格式 })
        continue
      }

      switch (子.名) {
        case 't':
          收集器.推({ 种类: '文本', 文本: 子.文本(), ...格式 })
          break

        case 'delText':
          收集器.有修订 = true
          收集器.推({ 种类: '文本', 文本: 子.文本(), ...格式, 删除: true, 修订: { 类型: '删除' } })
          break

        case 'drawing':
        case 'pict':
          收集器.推({ 种类: '绘图', 节点: 子, ...格式 })
          break

        case 'object':
          收集器.推({ 种类: '嵌入对象', 节点: 子, ...格式 })
          break

        case 'footnoteReference':
          收集器.推({ 种类: '脚注引用', id: 子.属性('id'), 注型: '脚注' })
          break

        case 'endnoteReference':
          收集器.推({ 种类: '脚注引用', id: 子.属性('id'), 注型: '尾注' })
          break

        case 'commentReference':
          收集器.推({ 种类: '批注标记', id: 子.属性('id'), 起: false, 引用: true })
          break

        case 'fldChar':
          收集器.读域标记(子)
          break

        case 'instrText':
          收集器.读域指令(子)
          break

        case 'AlternateContent': {
          const 支 = 子.找('Fallback', MC) || 子.找('Choice', MC)
          if (支) 收集器.遍历(支, 上下文)
          break
        }

        case 'txbxContent':
          收集器.推({ 种类: '文本框', 节点: 子 })
          break

        default:
          if (子.子.length) 收集器.遍历(子, 上下文)
          break
      }
    }
  }
}
