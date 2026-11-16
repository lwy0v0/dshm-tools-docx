/**
 * 图形级信息:定位 / 变换 / 裁剪。
 *
 * 单位保原生(EMU:1in = 914400);旋转是 1/60000 度;裁剪是千分比。
 * 拆出来是因为 `image.js` 只管"图从哪来、多大",这些是"摆在哪、怎么翻"的事。
 */

import { A, WP } from '../ooxml/ns.js'
import { 找后代 } from './blocks/image.js'

export class 图形定位 {
  /**
   * @param {import('../ooxml/xml.js').XmlNode} 节点 `w:drawing` / `w:pict`
   * @returns {{方式:string, 相对H?:string, 偏移H?:number, 对齐H?:string, 相对V?:string, 偏移V?:number, 对齐V?:string, 环绕?:string, 在文字下方?:boolean, 锁定锚点?:boolean}}
   */
  static 读 (节点) {
    const anchor = 找后代(节点, 'anchor', WP)
    if (!anchor) return { 方式: 'inline' }

    const 横 = 图形定位.取轴(anchor, 'positionH')
    const 纵 = 图形定位.取轴(anchor, 'positionV')
    const 环绕节点 = anchor.子.find(c => /^wrap/.test(c.名))
    const 环绕 = 环绕节点 ? 环绕节点.名.replace(/^wrap/, '').toLowerCase() : 'none'

    return {
      方式: 'anchor',
      相对H: 横.相对,
      偏移H: 横.偏移,
      对齐H: 横.对齐,
      相对V: 纵.相对,
      偏移V: 纵.偏移,
      对齐V: 纵.对齐,
      环绕,
      在文字下方: (anchor.属性('behindDoc') || '0') === '1',
      锁定锚点: (anchor.属性('locked') || '0') === '1'
    }
  }

  static 取轴 (anchor, 名) {
    const 轴 = 找后代(anchor, 名, WP)
    if (!轴) return { 相对: '', 偏移: 0, 对齐: '' }
    const 偏移节点 = 找后代(轴, 'posOffset', WP)
    const 对齐节点 = 找后代(轴, 'align', WP)
    const 偏移 = 偏移节点 ? Number(偏移节点.全部文本()) : 0
    return {
      相对: 轴.属性('relativeFrom') || '',
      偏移: Number.isFinite(偏移) ? 偏移 : 0,
      对齐: 对齐节点 ? 对齐节点.全部文本() : ''
    }
  }
}

export class 图形变换 {
  /** @param {import('../ooxml/xml.js').XmlNode} 节点 */
  static 读 (节点) {
    const 变换 = 找后代(节点, 'xfrm', A)
    if (!变换) return null

    const 结果 = {}
    const rot = 变换.属性('rot')
    if (rot !== undefined && Number(rot) !== 0) 结果.旋转 = Number(rot) / 60000
    if ((变换.属性('flipH') || '0') === '1') 结果.水平翻转 = true
    if ((变换.属性('flipV') || '0') === '1') 结果.垂直翻转 = true

    const 偏移 = 变换.找('off', A)
    const 尺寸 = 变换.找('ext', A)
    if (偏移) {
      const x = Number(偏移.属性('x'))
      const y = Number(偏移.属性('y'))
      if (Number.isFinite(x) && Number.isFinite(y)) 结果.偏移 = { x, y }
    }
    if (尺寸) {
      const cx = Number(尺寸.属性('cx'))
      const cy = Number(尺寸.属性('cy'))
      if (Number.isFinite(cx) && Number.isFinite(cy)) 结果.尺寸 = { cx, cy }
    }
    return Object.keys(结果).length ? 结果 : null
  }
}

export class 图形裁剪 {
  /** @param {import('../ooxml/xml.js').XmlNode} 节点 */
  static 读 (节点) {
    const 矩形 = 找后代(节点, 'srcRect', A)
    if (!矩形) return null
    const 结果 = {}
    for (const [键, 名] of [['l', '左'], ['t', '上'], ['r', '右'], ['b', '下']]) {
      const v = 矩形.属性(键)
      if (v !== undefined && Number(v) !== 0) 结果[名] = Number(v) / 1000
    }
    return Object.keys(结果).length ? 结果 : null
  }
}
