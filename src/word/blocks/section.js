/**
 * 分节与页眉页脚。
 *
 * 分节里能读到的都是"数值"(纸张尺寸、页边距、栏数),所以输出成一句人能读懂的话;
 * 页眉页脚是独立部件,必须**切到它自己的关系表**再解析,否则里面的图片会解析失败。
 */

import { W } from '../../ooxml/ns.js'

/** 纸张尺寸(缇 → 毫米) */
function 毫米 (缇) {
  const 值 = Number(缇)
  if (!Number.isFinite(值)) return null
  return Math.round(值 / 1440 * 25.4)
}

/**
 * 解析 `w:sectPr`(可能出现在段落 pPr 里,也可能在 body 末尾)。
 * @returns {object|null}
 */
export function 解析分节 (sectPr, 上下文) {
  if (!sectPr) return null
  const 段 = []
  const 版式 = {}

  const pgSz = sectPr.找('pgSz', W)
  if (pgSz) {
    const w = 毫米(pgSz.属性('w'))
    const h = 毫米(pgSz.属性('h'))
    const 横 = (pgSz.属性('orient') || 'portrait') === 'landscape'
    if (w && h) {
      段.push(`纸张 ${w}×${h}mm${横 ? '(横向)' : ''}`)
      版式.纸张 = { 宽: w, 高: h, 方向: 横 ? 'landscape' : 'portrait' }
    }
  }

  const pgMar = sectPr.找('pgMar', W)
  if (pgMar) {
    const 上 = 毫米(pgMar.属性('top'))
    const 下 = 毫米(pgMar.属性('bottom'))
    const 左 = 毫米(pgMar.属性('left'))
    const 右 = 毫米(pgMar.属性('right'))
    if (上 !== null) {
      段.push(`页边距 上${上}/下${下}/左${左}/右${右}mm`)
      版式.页边距 = { 上, 下, 左, 右 }
    }
    const 页眉 = 毫米(pgMar.属性('header'))
    const 页脚 = 毫米(pgMar.属性('footer'))
    const 装订 = 毫米(pgMar.属性('gutter'))
    if (页眉 !== null || 页脚 !== null) 版式.页眉页脚距 = { 页眉: 页眉 ?? 0, 页脚: 页脚 ?? 0 }
    if (装订) 版式.装订线 = 装订
  }

  const cols = sectPr.找('cols', W)
  if (cols) {
    const 数 = Number(cols.属性('num') || 1)
    版式.栏数 = 数
    if (数 > 1) 段.push(`${数} 栏`)
  }

  // 文档网格(中文排版:每页多少行)
  const 网格 = sectPr.找('docGrid', W)
  if (网格) {
    const 行距 = Number(网格.属性('linePitch'))
    const 类型 = 网格.属性('type') || (行距 ? 'lines' : 'default')
    const 每页行数 = 行距 > 0 && 版式.纸张 && 版式.页边距
      ? Math.floor(((版式.纸张.高 - 版式.页边距.上 - 版式.页边距.下) / 25.4 * 1440) / 行距)
      : null
    版式.网格 = { 类型, 行距: Number.isFinite(行距) ? 行距 : 0, ...(每页行数 ? { 每页行数 } : {}) }
  }

  const 竖直 = sectPr.找('vAlign', W)?.属性('val')
  if (竖直) 版式.竖直对齐 = 竖直
  if (sectPr.找('titlePg', W)) 版式.首页不同 = true

  const type = sectPr.找('type', W)?.属性('val')
  if (type && type !== 'nextPage') {
    const 译 = { continuous: '连续', evenPage: '偶数页起', oddPage: '奇数页起' }
    段.push(`分节类型 ${译[type] || type}`)
    版式.分节类型 = type
  }

  const 页码起始 = sectPr.找('pgNumType', W)?.属性('start')
  if (页码起始) {
    段.push(`页码从 ${页码起始} 起`)
    版式.页码起始 = Number(页码起始)
  }

  // 页眉页脚引用(回写要按节恢复:默认 / 首页 / 偶数页)
  const 页眉引用 = 读引用(sectPr, 'headerReference', 上下文)
  const 页脚引用 = 读引用(sectPr, 'footerReference', 上下文)

  上下文.统计.分节++
  const 有内容 = 段.length || 页眉引用.length || 页脚引用.length
  if (!有内容) return null
  return {
    类型: '分节',
    描述: 段.join(','),
    版式,
    ...(页眉引用.length ? { 页眉引用 } : {}),
    ...(页脚引用.length ? { 页脚引用 } : {}),
    锚: 上下文.锚(sectPr)
  }
}

/** 读一节里的 headerReference / footerReference */
function 读引用 (sectPr, 元素名, 上下文) {
  const 出 = []
  for (const 引用 of sectPr.找全部(元素名, W)) {
    const rid = 引用.属性('id')
    const 关系 = rid ? 上下文.关系目标(rid) : null
    出.push({
      类型: 引用.属性('type') || 'default',
      部件: 关系?.目标 || null,
      关系id: rid || null
    })
  }
  return 出
}

/** 全文扫一遍 sectPr,得到"部件 → 页眉页脚类型"的对照 */
function 读页眉页脚用途 (上下文) {
  const 表 = new Map()
  const 根 = 上下文.包.xml(上下文.主文档)
  if (!根) return 表
  const 走 = (节点) => {
    for (const 子 of 节点.子) {
      if (子.名 === 'sectPr' && W.includes(子.uri)) {
        for (const 名 of ['headerReference', 'footerReference']) {
          for (const 引用 of 子.找全部(名, W)) {
            const rid = 引用.属性('id')
            const 关系 = rid ? 上下文.包.关系(上下文.主文档)[rid] : null
            if (!关系) continue
            表.set(关系.目标, {
              位置: 名 === 'headerReference' ? '页眉' : '页脚',
              类型: 引用.属性('type') || 'default'
            })
          }
        }
      }
      走(子)
    }
  }
  走(根)
  return 表
}

/**
 * 收集本文档的页眉页脚(默认 / 首页 / 偶数页)。
 * @param {import('../context.js').WordContext} 上下文
 */
export function 解析页眉页脚 (上下文) {
  const 关系 = 上下文.包.关系(上下文.主文档)
  const 用途 = 读页眉页脚用途(上下文)
  const 结果 = []
  const 原部件 = 上下文.主文档
  const 类型译 = { default: '默认', first: '首页', even: '偶数页' }

  for (const [rid, 关系信息] of Object.entries(关系)) {
    const 是页眉 = 关系信息.类型.endsWith('/header')
    const 是页脚 = 关系信息.类型.endsWith('/footer')
    if (!是页眉 && !是页脚) continue
    if (关系信息.外部) continue

    const 根 = 上下文.包.xml(关系信息.目标)
    if (!根) continue

    上下文.用部件(关系信息.目标)
    const 块 = 上下文.解析块 ? 上下文.解析块(根) : []
    上下文.用部件(原部件)

    if (!块.length) continue
    const 用途信息 = 用途.get(关系信息.目标)
    结果.push({
      类型: '页眉页脚',
      位置: 是页眉 ? '页眉' : '页脚',
      作用域: 用途信息 ? (类型译[用途信息.类型] || 用途信息.类型) : '未引用',
      部件: 关系信息.目标,
      关系id: rid,
      块
    })
  }
  return 结果
}
