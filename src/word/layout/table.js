/**
 * 表格尺寸:表(列宽/表宽/布局/边框/底纹/对齐)、行(高/表头/不断页)、格(宽/边框/底纹/方向/斜线)。
 *
 * 单位保原生:列宽、行高、格宽都是**缇**。
 */

import { W } from '../../ooxml/ns.js'
import { 边框, 底纹 } from './border.js'

export class 表格尺寸 {
  /** @param {import('../../ooxml/xml.js').XmlNode} 节点 `w:tbl` */
  static 读 (节点) {
    const 结果 = {}
    const tblPr = 节点.找('tblPr', W)

    const grid = 节点.找('tblGrid', W)
    if (grid) {
      const 列宽 = grid.找全部('gridCol', W).map(g => Number(g.属性('w'))).filter(Number.isFinite)
      if (列宽.length) 结果.列宽 = 列宽
    }

    const tblW = tblPr?.找('tblW', W)
    if (tblW) {
      const 值 = Number(tblW.属性('w'))
      if (Number.isFinite(值)) 结果.表宽 = { 值, 类型: tblW.属性('type') || 'auto' }
    }

    const 布局 = tblPr?.找('tblLayout', W)?.属性('type')
    if (布局) 结果.布局 = 布局

    const 边 = 边框.读(tblPr?.找('tblBorders', W))
    if (边) 结果.边框 = 边

    const 纹 = 底纹.读(tblPr?.找('shd', W))
    if (纹) 结果.底纹 = 纹

    const 对齐 = tblPr?.找('jc', W)?.属性('val')
    if (对齐) 结果.对齐 = 对齐

    return 结果
  }
}

export class 行尺寸 {
  /** @param {import('../../ooxml/xml.js').XmlNode} tr */
  static 读 (tr) {
    const 结果 = {}
    const trPr = tr.找('trPr', W)

    const 高 = trPr?.找('trHeight', W)
    if (高) {
      const 值 = Number(高.属性('val'))
      if (Number.isFinite(值)) 结果.高 = 值
      const 规则 = 高.属性('hRule')
      if (规则) 结果.高规则 = 规则
    }

    if (trPr?.有没有('tblHeader', W)) 结果.表头 = true
    if (trPr?.有没有('cantSplit', W)) 结果.不断页 = true

    const 对齐 = trPr?.找('jc', W)?.属性('val')
    if (对齐) 结果.对齐 = 对齐

    return 结果
  }
}

export class 格尺寸 {
  /** @param {import('../../ooxml/xml.js').XmlNode|null} tcPr */
  static 读 (tcPr) {
    const 结果 = {}

    const tcW = tcPr?.找('tcW', W)
    if (tcW) {
      const 值 = Number(tcW.属性('w'))
      if (Number.isFinite(值)) { 结果.宽 = 值; 结果.宽类型 = tcW.属性('type') || 'auto' }
    }

    const 边 = 边框.读(tcPr?.找('tcBorders', W))
    if (边) 结果.边框 = 边

    const 纹 = 底纹.读(tcPr?.找('shd', W))
    if (纹) 结果.底纹 = 纹

    const 方向 = tcPr?.找('textDirection', W)?.属性('val')
    if (方向) 结果.文字方向 = 方向

    const 垂直 = tcPr?.找('vAlign', W)?.属性('val')
    if (垂直) 结果.垂直对齐 = 垂直

    const tcBorders = tcPr?.找('tcBorders', W)
    if (tcBorders?.找('tl2br', W)) 结果.斜线 = 'tl2br'
    else if (tcBorders?.找('tr2bl', W)) 结果.斜线 = 'tr2bl'

    return 结果
  }
}
