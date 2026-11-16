/**
 * 表格:`w:tbl` → 行 × 单元格,保留合并信息。
 *
 * 合并的两条规则(不处理就会行列错位):
 * - 横向 `w:gridSpan` 占 N 列;
 * - 纵向 `w:vMerge` 的 `restart` 是起点,`continue`(或无 val)是延续格,内容为空。
 */

import { W } from '../../ooxml/ns.js'
import { 解析段落 } from './paragraph.js'
import { 表格尺寸, 行尺寸, 格尺寸 } from '../layout/index.js'

/**
 * @param {import('../../ooxml/xml.js').XmlNode} 节点
 * @param {import('../context.js').WordContext} 上下文
 */
export function 解析表格 (节点, 上下文) {
  const 行们 = 节点.找全部('tr', W)
  const 行数据 = []
  let 合并 = false
  let 列数 = 0

  for (const 行 of 行们) {
    const 格们 = []
    const trPr = 行.找('trPr', W)
    const 表头行 = !!trPr?.有没有('tblHeader', W)
    const 行信息 = 行尺寸.读(行)
    for (const 格 of 行.找全部('tc', W)) {
      const tcPr = 格.找('tcPr', W)
      const 跨列 = Number(tcPr?.找('gridSpan', W)?.属性('val') ?? 1) || 1
      const vMerge节点 = tcPr?.找('vMerge', W)
      const vMerge = vMerge节点 ? (vMerge节点.属性('val') || 'continue') : null
      const 格信息 = 格尺寸.读(tcPr)
      if (跨列 > 1 || vMerge) 合并 = true
      if (vMerge === 'continue') {
        // 延续格:内容归起点格,这里只占位
        格们.push({ 块: [], 跨列, 纵向: '延续', ...格信息 })
        continue
      }
      格们.push({ 块: 解析格内容(格, 上下文), 跨列, 纵向: vMerge === 'restart' ? '起' : null, ...格信息 })
    }
    // 逻辑列数按 gridSpan 累加
    列数 = Math.max(列数, 格们.reduce((s, c) => s + c.跨列, 0))
    行数据.push({ 格: 格们, 表头: 表头行, ...行信息 })
  }

  const tblPr = 节点.找('tblPr', W)
  const 题注 = tblPr?.找('tblCaption', W)?.属性('val') || ''
  const 说明 = tblPr?.找('tblDescription', W)?.属性('val') || ''
  const 表信息 = 表格尺寸.读(节点)

  上下文.统计.表格++
  上下文.统计.表格行 += 行数据.length
  上下文.资源.表格.push(`${行数据.length} 行 × ${列数} 列${合并 ? '(含合并单元格)' : ''}${题注 ? ` · ${题注}` : ''}`)

  return {
    类型: '表格',
    行: 行数据,
    列数,
    合并,
    题注,
    说明,
    ...表信息,
    锚: 上下文.锚(节点)
  }
}

/** 单元格内容:可能有多段、图片、公式 */
function 解析格内容 (格, 上下文) {
  const 块 = []
  for (const 子 of 格.子) {
    if (子.名 === 'tcPr') continue
    if (子.名 === 'p' && W.includes(子.uri)) {
      const 段 = 解析段落(子, 上下文)
      if (段) 块.push(段)
    } else if (子.名 === 'tbl' && W.includes(子.uri)) {
      // 嵌套表:内层单独解析
      块.push(解析表格(子, 上下文))
    } else if (子.名 === 'sdt' && W.includes(子.uri)) {
      const 内容 = 子.找('sdtContent', W)
      if (内容) 块.push(...解析格内容(内容, 上下文))
    } else if (子.子.length) {
      块.push(...解析格内容(子, 上下文))
    }
  }
  return 块
}
