/**
 * 行内格式:把 `w:rPr` 读成一段文字该有的样子(粗斜、上下标、字号颜色字体、字符版式…)。
 *
 * 单独成文件的原因:格式规则会随"带样式模式"不断加条目,而遍历逻辑不该跟着变长。
 */

import { W } from '../../ooxml/ns.js'
import { 开关 } from '../styles.js'
import { 字符版式 } from '../layout/index.js'

export class 行内格式 {
  /**
   * @param {import('../styles.js').StyleSheet} 样式表
   * @param {() => (string|null)} 取域链接 当前是否在 HYPERLINK 域结果里
   */
  constructor (样式表, 取域链接 = () => null) {
    this.样式表 = 样式表
    this.取域链接 = 取域链接
  }

  /**
   * @param {import('../../ooxml/xml.js').XmlNode|null} rPr
   * @param {object} 上下文 遍历上下文(继承格式、链接、修订)
   * @returns {object} 片段格式
   */
  读 (rPr, 上下文) {
    const 默认字号 = this.样式表?.默认字号 ?? null
    const 默认字体 = this.样式表?.默认字体 ?? null

    const 格式 = { 粗体: 上下文.粗体, 斜体: 上下文.斜体 }
    if (上下文.字号 && 上下文.字号 !== 默认字号) 格式.字号 = 上下文.字号
    if (上下文.颜色) 格式.颜色 = 上下文.颜色
    if (上下文.字体 && 上下文.字体 !== 默认字体) 格式.字体 = 上下文.字体

    if (!rPr) return this.收尾(格式, 上下文)

    if (rPr.有没有('b', W)) 格式.粗体 = 开关(rPr.找('b', W))
    if (rPr.有没有('i', W)) 格式.斜体 = 开关(rPr.找('i', W))

    const u = rPr.找('u', W)?.属性('val') || (rPr.有没有('u', W) ? 'single' : null)
    if (u && u !== 'none') {
      格式.下划线 = true
      if (u !== 'single') 格式.下划线类型 = u
    }

    if (rPr.有没有('strike', W) || rPr.有没有('dstrike', W)) 格式.删除线 = true
    if (rPr.有没有('vanish', W)) 格式.隐藏 = true

    const va = rPr.找('vertAlign', W)?.属性('val')
    if (va === 'superscript') 格式.上标 = true
    if (va === 'subscript') 格式.下标 = true

    const 色 = rPr.找('color', W)?.属性('val')
    if (色 && 色 !== 'auto') 格式.颜色 = 色

    const sz = rPr.找('sz', W)?.属性('val')
    if (sz) {
      const 磅 = Number(sz) / 2
      if (Number.isFinite(磅) && 磅 !== 默认字号) 格式.字号 = 磅
      else delete 格式.字号
    }

    const 字体节点 = rPr.找('rFonts', W)
    if (字体节点) {
      const 字 = 字体节点.属性('eastAsia') || 字体节点.属性('ascii')
      if (字 && 字 !== 默认字体) 格式.字体 = 字
    }

    const 高亮 = rPr.找('highlight', W)?.属性('val')
    if (高亮 && 高亮 !== 'none') 格式.高亮 = 高亮

    const 底纹 = rPr.找('shd', W)?.属性('fill')
    if (底纹 && 底纹 !== 'auto' && 底纹 !== 'FFFFFF') 格式.底纹 = 底纹

    const 字符 = 字符版式.读(rPr)
    if (字符) 格式.字符版式 = 字符

    this.读字符样式(rPr, 格式, 默认字号, 默认字体)
    return this.收尾(格式, 上下文)
  }

  /** 字符样式(会覆盖前面对应的开关) */
  读字符样式 (rPr, 格式, 默认字号, 默认字体) {
    const id = rPr.找('rStyle', W)?.属性('val')
    if (!id) return
    const 样式 = this.样式表?.求字符(id)
    if (样式) {
      if (样式.粗体) 格式.粗体 = true
      if (样式.斜体) 格式.斜体 = true
      if (样式.字号 && 样式.字号 !== 默认字号) 格式.字号 = 样式.字号
      if (样式.颜色) 格式.颜色 = 样式.颜色
      if (样式.字体 && 样式.字体 !== 默认字体) 格式.字体 = 样式.字体
    }
    格式.字符样式 = id
  }

  /** 补链接与修订信息 */
  收尾 (格式, 上下文) {
    if (上下文.链接) 格式.链接 = 上下文.链接
    else {
      const 域链接 = this.取域链接()
      if (域链接) 格式.链接 = 域链接
    }
    if (上下文.修订) 格式.修订 = 上下文.修订
    return 格式
  }
}

