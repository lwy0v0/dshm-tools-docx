/**
 * 嵌入对象:图表(数据可转文本)、SmartArt(文字可转文本)、OLE(MathType/嵌入 Excel)、altChunk。
 *
 * 这三类的共同点:**不是纯图片**,内部还有结构化数据,所以尽量转成文本,识图只作补充。
 *
 * 注意:这里返回的是**块对象**(用 `类型`),不是行内片段(用 `种类`)——
 * 它们不能塞进行内,由段落解析提升成独立块。
 */

import { C, DGM, O } from '../../ooxml/ns.js'
import { 找后代, 找所有后代 } from '../../ooxml/xml.js'

/**
 * 解析"绘图里除了图片之外的东西"。
 * @returns {object|null} 块
 */
export function 解析嵌入 (节点, 上下文) {
  // 图表
  const 图表引用 = 找后代(节点, 'chart', C)
  if (图表引用) return 读图表(图表引用, 上下文)

  // SmartArt
  const 图形引用 = 找后代(节点, 'relIds', DGM)
  if (图形引用) return 读智能图形(图形引用, 上下文)

  // OLE 对象
  const ole = 找后代(节点, 'OLEObject', O)
  if (ole) {
    const 程序 = ole.属性('ProgID') || ''
    const 说明 = /Equation/i.test(程序) ? '公式(MathType/公式编辑器)'
      : /Excel/i.test(程序) ? '嵌入的 Excel 表格'
        : /Visio/i.test(程序) ? '嵌入的 Visio 图形'
          : /Package/i.test(程序) ? '嵌入的文件包' : '嵌入对象'
    上下文.记不可得(`OLE ${说明}`, '内部数据无法解析,需要渲染才能看')
    return { 类型: '嵌入对象', 说明, 程序 }
  }
  return null
}

/** 图表:从 c:numCache / c:strCache 里把系列数据挖出来 */
function 读图表 (引用, 上下文) {
  const rid = 引用.属性('id')
  const 关系 = rid ? 上下文.关系目标(rid) : null
  if (!关系) return { 类型: '图表', 类型名: '未知', 系列: [], 说明: '图表引用丢失' }

  const 根 = 上下文.包.xml(关系.目标)
  if (!根) return { 类型: '图表', 类型名: '未知', 系列: [], 说明: '图表部件读不到' }

  // 图表类型元素是 plotArea 的子节点(barChart / lineChart …)
  const 绘图区 = 找后代(根, 'plotArea', C) || 根
  let 类型名 = '未知'
  let 类型节点 = null
  for (const c of 绘图区.子) {
    if (/Chart$/.test(c.名)) { 类型名 = c.名.replace(/Chart$/, ''); 类型节点 = c; break }
  }
  const 宿主 = 类型节点 || 绘图区

  const 系列 = []
  for (const ser of 找所有后代(宿主, 'ser', C)) {
    const 名 = 读缓存文本(ser.找('tx', C))
    const 分类 = 读缓存数组(ser.找('cat', C))
    const 数值 = 读缓存数组(ser.找('val', C))
    系列.push({ 名, 分类, 数值 })
  }

  上下文.资源.图表.push(`${类型名}图表 · ${系列.length} 个系列`)

  return { 类型: '图表', 类型名, 系列, 说明: '' }
}

/** c:tx 里的系列名 */
function 读缓存文本 (节点) {
  if (!节点) return ''
  const v = 找后代(节点, 'v', C)
  return v ? v.文本() : ''
}

/** c:cat / c:val 里的缓存数组 */
function 读缓存数组 (节点) {
  if (!节点) return []
  const 缓存 = 找后代(节点, 'numCache', C) || 找后代(节点, 'strCache', C)
  if (!缓存) return [] // 只存了引用(数据在外部工作簿)
  return 缓存.找全部('pt', C).map(pt => pt.找('v', C)?.文本() ?? '')
}

/** SmartArt:data1.xml 的文本点 */
function 读智能图形 (引用, 上下文) {
  const rid = 引用.属性('dm')
  const 关系 = rid ? 上下文.关系目标(rid) : null
  if (!关系) return { 类型: '智能图形', 文本: [], 说明: 'SmartArt 数据引用丢失' }

  const 根 = 上下文.包.xml(关系.目标)
  if (!根) return { 类型: '智能图形', 文本: [], 说明: 'SmartArt 数据部件读不到' }

  const 文本 = []
  for (const pt of 找所有后代(根, 'pt', DGM)) {
    const t = 找后代(pt, 't', DGM)
    const 值 = t ? t.全部文本().trim() : ''
    if (值) 文本.push(值)
  }
  return { 类型: '智能图形', 文本, 说明: '' }
}
