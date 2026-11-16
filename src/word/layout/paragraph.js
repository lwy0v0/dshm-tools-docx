/**
 * 段落版式:对齐 / 缩进 / 行距 / 分页控制 / 编号引用 / 边框底纹 / 制表位 / 框架。
 *
 * 单位保原生:缩进、制表位、框架尺寸都是**缇**(1pt = 20 缇)。
 */

import { W } from '../../ooxml/ns.js'
import { 边框, 底纹 } from './border.js'
import { 开关 } from './character.js'

export class 段落版式 {
  /**
   * @param {import('../../ooxml/xml.js').XmlNode|null} pPr
   * @returns {object|null}
   */
  static 读 (pPr) {
    if (!pPr) return null
    const 版式 = {}

    const jc = pPr.找('jc', W)?.属性('val')
    if (jc) 版式.对齐 = jc

    const 缩进 = 段落版式.读缩进(pPr.找('ind', W))
    if (缩进) 版式.缩进 = 缩进

    const 行距 = 段落版式.读行距(pPr.找('spacing', W))
    if (行距) 版式.行距 = 行距

    for (const [键, 名] of [['pageBreakBefore', '分页前'], ['keepNext', '与下段同页'], ['keepLines', '段内同页'], ['widowControl', '孤行控制'], ['contextualSpacing', '上下文间距'], ['snapToGrid', '对齐网格']]) {
      if (pPr.有没有(键, W)) 版式[名] = 开关(pPr.找(键, W))
    }

    const 编号 = pPr.找('numPr', W)
    if (编号) {
      版式.编号 = {
        numId: 编号.找('numId', W)?.属性('val') ?? null,
        ilvl: Number(编号.找('ilvl', W)?.属性('val') ?? 0) || 0
      }
    }

    const 样式 = pPr.找('pStyle', W)?.属性('val')
    if (样式) 版式.样式 = 样式

    const 边 = 边框.读(pPr.找('pBdr', W))
    if (边) 版式.边框 = 边

    const 纹 = 底纹.读(pPr.找('shd', W))
    if (纹) 版式.底纹 = 纹

    const 制表位 = 段落版式.读制表位(pPr.找('tabs', W))
    if (制表位) 版式.制表位 = 制表位

    const 框架 = 段落版式.读框架(pPr.找('framePr', W))
    if (框架) 版式.框架 = 框架

    return Object.keys(版式).length ? 版式 : null
  }

  static 读缩进 (ind) {
    if (!ind) return null
    const 缩进 = {}
    for (const [键, 名] of [['left', '左'], ['right', '右'], ['firstLine', '首行'], ['hanging', '悬挂'], ['start', '左'], ['end', '右']]) {
      const v = ind.属性(键)
      if (v !== undefined && Number.isFinite(Number(v))) 缩进[名] = Number(v)
    }
    return Object.keys(缩进).length ? 缩进 : null
  }

  static 读行距 (sp) {
    if (!sp) return null
    const 行距 = {}
    for (const [键, 名] of [['line', '行'], ['lineRule', '规则'], ['before', '段前'], ['after', '段后'], ['beforeLines', '段前行'], ['afterLines', '段后行']]) {
      const v = sp.属性(键)
      if (v === undefined || v === '') continue
      行距[名] = 名 === '规则' ? v : Number(v)
    }
    return Object.keys(行距).length ? 行距 : null
  }

  static 读制表位 (tabs) {
    if (!tabs) return null
    const 表 = tabs.找全部('tab', W)
      .map(t => ({
        位置: Number(t.属性('pos')),
        对齐: t.属性('val') || 'left',
        ...(t.属性('leader') ? { 前导符: t.属性('leader') } : {})
      }))
      .filter(t => Number.isFinite(t.位置))
    return 表.length ? 表 : null
  }

  static 读框架 (frame) {
    if (!frame) return null
    const 框 = {}
    for (const [键, 名] of [['w', '宽'], ['h', '高'], ['x', '横偏移'], ['y', '纵偏移'], ['hAnchor', '横基准'], ['vAnchor', '纵基准'], ['wrap', '环绕'], ['hRule', '横规则'], ['vRule', '纵规则'], ['lines', '行数']]) {
      const v = frame.属性(键)
      if (v === undefined || v === '') continue
      框[名] = ['宽', '高', '横偏移', '纵偏移', '行数'].includes(名) ? Number(v) : v
    }
    // 首字下沉(`w:framePr w:dropCap="drop"`)
    const 下沉 = frame.属性('dropCap')
    if (下沉 && 下沉 !== 'none') 框.下沉 = 下沉
    return Object.keys(框).length ? 框 : null
  }
}
