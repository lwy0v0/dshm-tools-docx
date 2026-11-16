/**
 * 行内片段 → 输出片段。
 *
 * 这是"解析层的最后一步":把收集器吐出的原始片段(带 XML 节点的)换成
 * 输出层能直接渲染的片段(图片有路径、公式有 LaTeX、脚注有标号)。
 *
 * 块类内容(图表/SmartArt/OLE/文本框)在这里被标成 `{种类:'块'}`,由段落提升成独立块。
 */

import { W } from '../../ooxml/ns.js'
import { 找后代 } from '../../ooxml/xml.js'
import { 解析图片 } from './image.js'
import { 解析嵌入 } from './embed.js'
import { 图形定位 } from '../drawing.js'

/**
 * @param {object} f 行内片段
 * @param {import('../context.js').WordContext} 上下文
 * @returns {object|null|object[]}
 */
export function 解析片段 (f, 上下文) {
  switch (f.种类) {
    case '文本':
      // 修订删除的文字默认剔除(标注但不污染正文)
      if (f.删除 && !上下文.选项.保留修订) return null
      return f

    case '公式': {
      const latex = 上下文.公式.转(f.节点)
      if (!latex) return null
      上下文.统计.公式++
      上下文.资源.公式.push(latex)
      return { 种类: '公式', latex, 独立: !!f.独立 }
    }

    case '脚注引用': {
      const 标号 = 上下文.登记脚注(f.id, f.注型)
      return { 种类: '脚注引用', 标号, 注型: f.注型, 注id: f.id }
    }

    case '绘图':
    case '嵌入对象':
      return 解析绘图或对象(f, 上下文)

    case '文本框': {
      const 块 = 上下文.解析块 ? 上下文.解析块(f.节点) : []
      return { 种类: '块', 块: { 类型: '文本框', 块 } }
    }

    case '控件':
      上下文.统计.控件++
      return {
        种类: '控件',
        控件类型: f.控件类型,
        标签: f.标签,
        值: f.值,
        已勾选: f.已勾选,
        可选项: f.可选项,
        日期格式: f.日期格式,
        库: f.库,
        数据绑定: f.数据绑定
      }

    case '不可得':
      return { 种类: '不可得', 原因: f.原因, 原值: f.原值, 提示: f.提示 }

    case '批注标记':
      return null

    case '书签': {
      const 名 = (f.名 || '').trim()
      if (名 && !名.startsWith('_') && !上下文.资源.书签.includes(名)) 上下文.资源.书签.push(名)
      return null
    }

    default:
      return null
  }
}

/** 绘图/嵌入对象:图表、SmartArt、OLE、图片、文本框,依次尝试 */
function 解析绘图或对象 (f, 上下文) {
  const 嵌入 = 解析嵌入(f.节点, 上下文)
  if (嵌入) return { 种类: '块', 块: 嵌入 }

  const 图 = 解析图片(f.节点, 上下文)
  if (图) {
    上下文.统计.图片++
    return 图
  }

  const txbx = 找后代(f.节点, 'txbxContent', W)
  if (txbx) {
    const 块 = 上下文.解析块 ? 上下文.解析块(txbx) : []
    const docPr = 找后代(f.节点, 'docPr')
    return {
      种类: '块',
      块: {
        类型: '文本框',
        块,
        定位: 图形定位.读(f.节点),
        替代文字: docPr?.属性('descr') || docPr?.属性('title') || '',
        锚: 上下文.锚(f.节点)
      }
    }
  }

  上下文.记不可得('未知图形对象', '这个绘图对象里没有可读内容')
  return { 种类: '不可得', 原因: '未知图形对象' }
}
