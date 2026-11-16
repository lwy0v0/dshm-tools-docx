/**
 * 段落:普通段落、标题、列表项。
 *
 * 三个身份都由同一份数据决定:`pPr` 的样式 → 大纲级别决定是不是标题;
 * `pPr` 的 `numPr` 决定是不是列表;其余是普通段落。
 *
 * 片段怎么解析在 `fragment.js`;版式怎么读在 `layout/`。
 */

import { W } from '../../ooxml/ns.js'
import { 找所有后代 } from '../../ooxml/xml.js'
import { 解析片段 } from './fragment.js'
import { 段落版式 } from '../layout/index.js'

/**
 * @param {import('../../ooxml/xml.js').XmlNode} 节点
 * @param {import('../context.js').WordContext} 上下文
 * @returns {object|null}
 */
export function 解析段落 (节点, 上下文) {
  const pPr = 节点.找('pPr', W)
  const 样式id = pPr?.找('pStyle', W)?.属性('val') || null
  const 样式 = 上下文.样式.求段落(样式id, pPr)

  // 段落样式的字号/颜色/字体往下传(标题的 26pt 红字就靠它);
  // 粗体/斜体不传 —— 标题层级与 ** 标记会重复表达同一件事。
  const 收集 = 上下文.新收集器().收集(节点, {
    字号: 样式.字号,
    颜色: 样式.颜色,
    字体: 样式.字体
  })
  if (收集.有修订) 上下文.统计.修订++
  for (const id of 收集.批注ids) 上下文.记批注引用(id)
  const 片段 = []
  const 附加 = []
  for (const 原 of 收集.片段) {
    const 转 = 解析片段(原, 上下文)
    if (转 === null) continue
    for (const 一 of (Array.isArray(转) ? 转 : [转])) {
      // "块"类内容(图表/SmartArt/嵌入对象/文本框)不能塞进行内,提升成独立块
      if (一 && 一.种类 === '块') {
        一.块.随段落 = true // 回写时它由"整段回填"覆盖,不再单独输出
        附加.push(一.块)
      } else 片段.push(一)
    }
  }

  const 版式 = 段落版式.读(pPr)
  const 锚 = 上下文.锚(节点)
  // 含批注标记/页码域(不可得)的段落:回写时整段原样保留,否则批注会变孤儿、域会丢
  const 含未建模 = 收集.批注ids.length > 0 || 片段.some(f => f.种类 === '不可得')
  // 段首/段中有硬分页符(`w:br type="page"`):版面信息,记在段落上,不进正文
  const 分页 = 找所有后代(节点, 'br', W).some(b => (b.属性('type') || '') === 'page')

  // 列表
  const numPr = pPr?.找('numPr', W)
  if (numPr && 有内容(片段)) {
    const numId = numPr.找('numId', W)?.属性('val')
    const ilvl = Number(numPr.找('ilvl', W)?.属性('val') ?? 0) || 0
    if (numId !== undefined && numId !== null) {
      const 标 = 上下文.编号.下一(numId, ilvl)
      const 无序 = /^[•·▪◦‣∙-]$/.test(标.标签.trim()) || 标.标签.trim() === ''
      return 收尾({ 类型: '列表', 层级: ilvl, 标签: 标.标签, 无序, 片段, 版式, 锚, 含未建模, ...(分页 ? { 分页: true } : {}) }, 附加)
    }
  }

  // 标题
  if (样式.是标题 && 有内容(片段)) {
    上下文.统计.标题++
    return 收尾({
      类型: '标题',
      级别: Math.min(6, 样式.标题级别),
      片段,
      样式名: 样式.名称,
      版式,
      锚,
      含未建模,
      ...(分页 ? { 分页: true } : {})
    }, 附加)
  }

  if (!有内容(片段)) {
    // 只有附加块(比如一段里只有一张图表):把它交出去
    if (附加.length) return { 类型: '空', 片段: [], 附加 }
    return null
  }

  上下文.统计.段落++
  return 收尾({ 类型: '段落', 片段, 样式名: 样式.名称 || '', 版式, 锚, 含未建模, ...(分页 ? { 分页: true } : {}) }, 附加)
}

/** 把附加块挂在块上交给遍历器 */
function 收尾 (块, 附加) {
  if (附加.length) {
    块.附加 = 附加
    // 附加块都是未建模对象(图表/SmartArt/OLE/文本框):这一段回写时整段原样保留
    块.含未建模 = 附加.some(b => ['图表', '智能图形', '嵌入对象', '文本框'].includes(b.类型))
  }
  return 块
}

/** 片段里有没有实际内容 */
function 有内容 (片段) {
  return 片段.some(f => {
    if (f.种类 === '文本') return f.文本.trim() !== ''
    return true
  })
}
