/**
 * 样式求解:把 `w:pStyle` / `w:rStyle` 解析成"这个段落到底是什么"。
 *
 * 要点:样式有 `w:basedOn` 继承链,真要判断"是不是标题"必须走链;
 * 文档里的样式名可能被本地化(中文版 Word 会写成"标题 1"),所以名字与 styleId 都要认。
 *
 * 带样式模式用的字号/颜色/字体也从这里求(就近覆盖),这样"样式里定义的 16pt 红色标题"
 * 也能被标出来,而不是只看 run 上有没有直接属性。
 */

import { W } from '../ooxml/ns.js'

/** 段落有效属性(求解后的结果) */
export class 段落样式结果 {
  constructor () {
    this.名称 = ''
    this.大纲级别 = null // 0..8 对应 1..9 级标题
    this.粗体 = false
    this.斜体 = false
    this.是标题 = false
    this.标题级别 = 0
    /** 带样式模式用:字号(磅)、颜色(#RRGGBB)、字体 */
    this.字号 = null
    this.颜色 = null
    this.字体 = null
  }
}

export class StyleSheet {
  /**
   * @param {import('../ooxml/xml.js').XmlNode|null} 根 styles.xml 的根节点
   */
  constructor (根) {
    /** @type {Map<string, {类型:string, 名:string, 基于:string|null, pPr:any, rPr:any}>} */
    this.样式表 = new Map()
    this.默认段落 = null
    this.默认文本 = null
    /** 文档默认字号(磅)与字体 */
    this.默认字号 = null
    this.默认字体 = null

    if (根) {
      for (const s of 根.找全部('style', W)) {
        const id = s.属性('styleId') || ''
        if (!id) continue
        this.样式表.set(id, {
          类型: s.属性('type') || 'paragraph',
          名: s.找('name', W)?.属性('val') || '',
          基于: s.找('basedOn', W)?.属性('val') || null,
          pPr: s.找('pPr', W),
          rPr: s.找('rPr', W)
        })
      }
      const 默认 = 根.找('docDefaults', W)
      this.默认段落 = 默认?.找('pPrDefault', W)?.找('pPr', W) || null
      this.默认文本 = 默认?.找('rPrDefault', W)?.找('rPr', W) || null
      if (this.默认文本) {
        const sz = this.默认文本.找('sz', W)?.属性('val')
        if (sz) this.默认字号 = Number(sz) / 2
        const 字体 = this.默认文本.找('rFonts', W)
        if (字体) this.默认字体 = 字体.属性('eastAsia') || 字体.属性('ascii') || null
      }
    }
  }

  /** 样式链:远祖先 → 自己 */
  样式链 (id) {
    const 链 = []
    let 当 = id
    const 见过 = new Set()
    while (当 && !见过.has(当)) {
      见过.add(当)
      const s = this.样式表.get(当)
      if (!s) break
      链.unshift(s)
      当 = s.基于
    }
    return 链
  }

  /**
   * 求段落的有效样式。
   * @param {string|null} 段落样式id
   * @param {import('../ooxml/xml.js').XmlNode|null} 直接pPr(段落上的直接属性优先)
   */
  求段落 (段落样式id, 直接pPr) {
    const 结果 = new 段落样式结果()
    const 链 = this.样式链(段落样式id)
    if (链.length) 结果.名称 = 链[链.length - 1].名 || 段落样式id || ''

    // 大纲级别:直接 pPr > 样式链自近而远 > 命名推断
    let 级别 = 读大纲(直接pPr)
    if (级别 === null) {
      for (let i = 链.length - 1; i >= 0 && 级别 === null; i--) 级别 = 读大纲(链[i].pPr)
    }
    if (级别 === null) 级别 = 按名字推断(段落样式id, 结果.名称)

    if (级别 !== null && 级别 >= 0 && 级别 <= 8) {
      结果.大纲级别 = 级别
      结果.是标题 = true
      结果.标题级别 = 级别 + 1
    }

    结果.粗体 = 链内开关(链, this.默认文本, 'b')
    结果.斜体 = 链内开关(链, this.默认文本, 'i')
    结果.字号 = 链内字号(链, this.默认文本)
    结果.颜色 = 链内颜色(链, this.默认文本)
    结果.字体 = 链内字体(链, this.默认文本)
    return 结果
  }

  /**
   * 求字符样式的开关(粗体/斜体)与字号颜色字体。
   * @param {string|null} 字符样式id
   */
  求字符 (字符样式id) {
    const 链 = this.样式链(字符样式id)
    return {
      粗体: 链内开关(链, null, 'b'),
      斜体: 链内开关(链, null, 'i'),
      字号: 链内字号(链, this.默认文本),
      颜色: 链内颜色(链, this.默认文本),
      字体: 链内字体(链, this.默认文本)
    }
  }
}

/** 从 pPr 读 outlineLvl(0 起);没有返回 null */
function 读大纲 (pPr) {
  if (!pPr) return null
  const ol = pPr.找('outlineLvl', W)
  if (!ol) return null
  const v = Number(ol.属性('val'))
  return Number.isFinite(v) ? v : null
}

/** 按 styleId / 样式名推断标题级别 */
function 按名字推断 (styleId, 名称) {
  const 候选 = [styleId || '', 名称 || '']
  for (const 值 of 候选) {
    const m = /^heading\s*([1-9])$/i.exec(值.trim())
    if (m) return Number(m[1]) - 1
    const c = /^标题\s*([1-9])$/.exec(值.trim())
    if (c) return Number(c[1]) - 1
    const h = /^Heading([1-9])$/.exec(值.trim())
    if (h) return Number(h[1]) - 1
  }
  return null
}

/** 样式链里 `b`/`i` 的最终值(近的覆盖远的;`w:val="0"` 表示关) */
function 链内开关 (链, 基底, 名) {
  let 值 = 基底 ? 开关(基底.找(名, W)) : false
  for (const s of 链) {
    if (s.rPr && s.rPr.有没有(名, W)) 值 = 开关(s.rPr.找(名, W))
  }
  return 值
}

/** `w:b` / `w:i` 节点 → 布尔(无 val 视为 true) */
export function 开关 (节点) {
  if (!节点) return false
  const v = 节点.属性('val')
  if (v === undefined) return true
  return !(v === '0' || v === 'false' || v === 'off')
}

/** 字号(磅);`w:sz` 是半磅 */
function 链内字号 (链, 基底) {
  let 值 = null
  const 起点 = 基底?.找('sz', W)?.属性('val')
  if (起点) 值 = Number(起点) / 2
  for (const s of 链) {
    const sz = s.rPr?.找('sz', W)?.属性('val')
    if (sz) 值 = Number(sz) / 2
  }
  return 值
}

/** 颜色(`#RRGGBB`),跳过 auto */
function 链内颜色 (链, 基底) {
  let 值 = null
  const 起点 = 基底?.找('color', W)?.属性('val')
  if (起点 && 起点 !== 'auto') 值 = 起点
  for (const s of 链) {
    const v = s.rPr?.找('color', W)?.属性('val')
    if (v && v !== 'auto') 值 = v
  }
  return 值
}

/** 字体(优先中文字体 eastAsia) */
function 链内字体 (链, 基底) {
  let 值 = null
  const 取 = (节点) => {
    if (!节点) return null
    return 节点.属性('eastAsia') || 节点.属性('ascii') || null
  }
  const 起点 = 取(基底?.找('rFonts', W))
  if (起点) 值 = 起点
  for (const s of 链) {
    const v = 取(s.rPr?.找('rFonts', W))
    if (v) 值 = v
  }
  return 值
}
