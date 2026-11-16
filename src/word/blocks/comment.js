/**
 * 批注:按正文出现顺序输出,带作者与时间;**回复线程**从 `commentsExtended.xml` 补。
 *
 * 回复关系是这么连的:`commentsExtended.xml` 的 `w15:commentEx` 带
 * `w15:paraId`(批注段落 id)与 `w15:paraIdParent`(父批注段落 id),
 * 而每条 `w:comment` 的第一个 `w:p` 上有 `w14:paraId` —— 两边靠 paraId 对上。
 */

import { W } from '../../ooxml/ns.js'

export const W15 = ['http://schemas.microsoft.com/office/word/2012/wordml']

/**
 * @param {import('../context.js').WordContext} 上下文
 */
export function 解析批注区 (上下文) {
  const ids = 上下文.引用批注
  if (!ids.length) return null

  const 表 = 上下文.批注表()
  const 扩展 = 读批注扩展(上下文)
  const 项 = []

  for (const id of ids) {
    const 批注 = 表.get(id)
    if (!批注) {
      项.push({ id, 作者: '', 时间: '', 块: [{ 类型: '不可得', 原因: `批注 ${id} 内容缺失` }] })
      continue
    }
    上下文.用部件(上下文.包.按类型找('/comments', 上下文.主文档) || 上下文.主文档)
    const 块 = 上下文.解析块 ? 上下文.解析块(批注.节点) : []
    上下文.用部件(上下文.主文档)

    const 段id = 首个段落id(批注.节点)
    const 扩 = 段id ? 扩展.get(段id) : null

    项.push({
      id,
      作者: 批注.作者,
      首字母: 批注.首字母,
      时间: 批注.时间,
      ...(段id ? { 段落id: 段id } : {}),
      ...(扩?.父 ? { 回复于: 扩.父 } : {}),
      ...(扩 ? { 已解决: !!扩.已完成 } : {}),
      块
    })
  }

  上下文.统计.批注 = 项.length
  上下文.资源.批注 = 项.map(x => ({ id: x.id, 作者: x.作者, 回复于: x.回复于 }))
  return 项.length ? { 类型: '批注区', 项 } : null
}

/** 批注的第一个段落上的 `w14:paraId` */
function 首个段落id (批注节点) {
  const p = 批注节点.找('p', W)
  const id = p?.属性('paraId')
  return id || null
}

/** commentsExtended: paraId → { 父, 已完成 } */
function 读批注扩展 (上下文) {
  const 表 = new Map()
  const 部件 = 上下文.包.按类型找('/commentsExtended', 上下文.主文档)
  if (!部件) return 表
  const 根 = 上下文.包.xml(部件)
  if (!根) return 表

  for (const 项 of 根.找全部('commentEx', W15)) {
    const id = 项.属性('paraId')
    if (!id) continue
    表.set(id, {
      父: 项.属性('paraIdParent') || null,
      已完成: (项.属性('done') || '0') === '1' || 项.属性('done') === 'true'
    })
  }
  return 表
}
