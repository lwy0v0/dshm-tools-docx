/**
 * 字符版式:字间距 / 缩放 / 升降 / 大小写 / 着重号 / 特殊隐藏。
 *
 * 单位保原生:字间距 = 1/20 磅,升降 = 半磅,缩放 = 百分比。
 */

export class 字符版式 {
  /**
   * @param {import('../../ooxml/xml.js').XmlNode|null} rPr
   * @returns {object|null}
   */
  static 读 (rPr) {
    if (!rPr) return null
    const 版式 = {}

    const 间距 = rPr.找('spacing')?.属性('val')
    if (间距 !== undefined && Number(间距) !== 0) 版式.字间距 = Number(间距)

    const 缩放 = rPr.找('w')?.属性('val')
    if (缩放 !== undefined && Number(缩放) !== 100) 版式.缩放 = Number(缩放)

    const 升降 = rPr.找('position')?.属性('val')
    if (升降 !== undefined && Number(升降) !== 0) 版式.升降 = Number(升降)

    if (rPr.有没有('caps')) 版式.全大写 = 开关(rPr.找('caps'))
    if (rPr.有没有('smallCaps')) 版式.小型大写 = 开关(rPr.找('smallCaps'))
    if (rPr.有没有('specVanish')) 版式.特殊隐藏 = 开关(rPr.找('specVanish'))

    const 着重 = rPr.找('em')?.属性('val')
    if (着重 && 着重 !== 'none') 版式.着重号 = 着重

    return Object.keys(版式).length ? 版式 : null
  }
}

/** `w:b` 这类开关:无 val 视为 true */
export function 开关 (节点) {
  if (!节点) return false
  const v = 节点.属性('val')
  if (v === undefined) return true
  return !(v === '0' || v === 'false' || v === 'off')
}
