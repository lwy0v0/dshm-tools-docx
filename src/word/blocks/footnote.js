/**
 * 脚注与尾注:只输出**正文引用到的**那些,并按引用顺序编号。
 *
 * 坑:`footnotes.xml` 里有 `separator` / `continuationSeparator` 这类分隔符条目,
 * 不排除的话文末会凭空多出两条空注。
 */

import { W } from '../../ooxml/ns.js'

/**
 * @param {import('../context.js').WordContext} 上下文
 * @returns {object|null}
 */
export function 解析注释区 (上下文) {
  const 引用 = [...上下文.引用脚注.values()]
  if (!引用.length) return null

  const 按注型 = new Map()
  for (const r of 引用) {
    if (!按注型.has(r.注型)) 按注型.set(r.注型, [])
    按注型.get(r.注型).push(r)
  }

  const 区 = []
  for (const [注型, 列表] of 按注型) {
    const 表 = 上下文.脚注表(注型)
    const 原部件 = 上下文.主文档
    const 项 = []
    for (const r of 列表.sort((a, b) => a.标号 - b.标号)) {
      const 定义 = 表.get(r.id)
      if (!定义) {
        项.push({ 标号: r.标号, 块: [{ 类型: '不可得', 原因: `${注型} ${r.id} 定义缺失` }] })
        continue
      }
      if (定义.类型 !== 'normal') continue // 分隔符:跳过
      // 注文里的图片/超链接要按 footnotes.xml 自己的 rels 解析
      上下文.用部件(定义.部件)
      const 块 = 上下文.解析块 ? 上下文.解析块(定义.节点) : []
      上下文.用部件(原部件)
      项.push({ 标号: r.标号, id: r.id, 块 })
    }
    if (项.length) 区.push({ 类型: '注释区', 注型, 项 })
  }

  return 区.length ? 区 : null
}
