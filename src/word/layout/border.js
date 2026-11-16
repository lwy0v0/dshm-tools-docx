/**
 * 边框与底纹:段落、表格、单元格三处共用。
 *
 * 单位保原生:边框粗细 `w:sz` 是 **1/8 磅**,颜色是 `auto` 或 `RRGGBB`。
 */

export class 边框 {
  /**
   * @param {import('../../ooxml/xml.js').XmlNode|null} 节点 `w:pBdr` / `w:tblBorders` / `w:tcBorders`
   * @returns {Record<string, ({样式:string, 粗细?:number, 颜色?:string, 间距?:number}|null)>|null}
   */
  static 读 (节点) {
    if (!节点) return null
    const 结果 = {}
    for (const [键, 名] of Object.entries(边框.名表)) {
      const 边 = 节点.找(键)
      if (!边) continue
      const 样式 = 边.属性('val') || 'single'
      if (样式 === 'nil' || 样式 === 'none') { 结果[名] = null; continue }
      结果[名] = {
        样式,
        粗细: Number(边.属性('sz') ?? 0) || undefined,
        颜色: 边.属性('color') || undefined,
        间距: Number(边.属性('space') ?? 0) || undefined
      }
    }
    return Object.keys(结果).length ? 结果 : null
  }
}

边框.名表 = {
  top: '上',
  left: '左',
  bottom: '下',
  right: '右',
  insideH: '内横',
  insideV: '内竖',
  start: '左',
  end: '右',
  tl2br: '斜线',
  tr2bl: '反斜线'
}

export class 底纹 {
  /**
   * @param {import('../../ooxml/xml.js').XmlNode|null} 节点 `w:shd`
   * @returns {{填充?:string, 图案?:string, 前景?:string}|null}
   */
  static 读 (节点) {
    if (!节点) return null
    const 结果 = {}
    const 填充 = 节点.属性('fill')
    const 图案 = 节点.属性('val')
    const 前景 = 节点.属性('color')
    if (填充 && 填充 !== 'auto') 结果.填充 = 填充
    if (图案 && 图案 !== 'clear') 结果.图案 = 图案
    if (前景 && 前景 !== 'auto') 结果.前景 = 前景
    return Object.keys(结果).length ? 结果 : null
  }
}
