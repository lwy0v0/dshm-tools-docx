/**
 * 公式结构基类。
 *
 * 每个 OMML 结构(分式、根式、求和…)一个类,放在 `structures/` 下,只实现"这种结构怎么变成 LaTeX"。
 * 遍历与分派在 `omml.js`;公共的转义与符号表在 `latex.js`。
 */

export class 公式结构 {
  /** 这个类负责的 OMML 元素本地名(可多个) */
  static 元素 = []

  /**
   * 转成 LaTeX。
   * @param {import('../ooxml/xml.js').XmlNode} _节点
   * @param {import('../math/context.js').公式上下文} _上下文
   * @returns {string}
   */
  转 (_节点, _上下文) {
    throw new Error(`${this.constructor.name} 没有实现 转()`)
  }

  /** 取某个参数节点(如 `m:num`)的 LaTeX;不存在给空 */
  参数 (节点, 名, 上下文) {
    const 子 = 节点.找(名, 上下文.公式命名空间)
    return 子 ? 上下文.转子(子) : ''
  }
}

/** 结构注册表构建辅助:数组 → 元素名 → 实例 */
export function 建注册表 (类们) {
  const 表 = new Map()
  for (const 类 of 类们) {
    const 实例 = new 类()
    for (const 元素 of 类.元素 || []) 表.set(元素, 实例)
  }
  return 表
}
