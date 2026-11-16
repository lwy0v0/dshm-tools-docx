/**
 * 示例:把一份文档改成**学术论文格式**(用可编辑视图 + 回写器完成)。
 *
 * 用法:node test/format-paper.js <可编辑产物目录>
 * 产物:同目录下 `论文格式.docx`
 *
 * 这是"编辑能力"的样板:只改 content.xml 的属性,不碰 raw 母版。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { 解析Xml } from '../src/ooxml/xml.js'
import { 回写器 } from '../src/edit/build.js'

// —— 论文格式规则(中文期刊/学位论文常见口径)——
const 字体 = { 标题: '黑体', 正文: '宋体', 数字: 'Times New Roman' }
const 字号 = { 论文标题: '22pt', 一级: '16pt', 二级: '14pt', 三级: '12pt', 正文: '12pt', 图表题注: '10.5pt', 脚注: '9pt' }

/** 页面:学位论文常见口径 —— A4;上 30 / 下 25 / 左 30 / 右 25 mm;页眉 15mm、页脚 17.5mm;每页 40 行;页码从 1 */
const 页面 = {
  'w:pageW': '210mm', 'w:pageH': '297mm',
  'w:marginTop': '30mm', 'w:marginBottom': '25mm',
  'w:marginLeft': '30mm', 'w:marginRight': '25mm',
  'w:headerDist': '15mm', 'w:footerDist': '17.5mm', 'w:gutter': '0mm',
  'w:vAlign': 'top',
  // 文档网格:行距 = 正文高 (297-30-25)mm ÷ 40 行 = 343 缇
  'w:gridType': 'lines', 'w:gridLine': '343', 'w:grid-lines-per-page': '40',
  'w:pageNumStart': '1',
  'w:cols': '1'
}

const 目录 = process.argv[2]
if (!目录) { console.error('用法:node test/format-paper.js <可编辑产物目录>'); process.exit(1) }

const 内容xml路径 = join(目录, 'content.xml')
const 根 = 解析Xml(readFileSync(内容xml路径, 'utf8'))
const body = 根.找('body') || 根
const 改动 = { 段落: 0, 标题: 0, 表格格: 0, 分节: 0, 跳过只读: 0 }
const 表头 = /^(Table|表)\s*\d|^Figure|^图\s*\d/i
let 章序号 = 0

for (const 节点 of body.子) {
  if (节点.名 === 'sectPr') { 设置页面(节点); continue }
  if (节点.名 === 'tbl') { 排表格(节点, 1); continue }
  if (节点.名 === 'p') { 排段落(节点, 0); continue }
}

// 写回 content.xml,再回写 docx
const 新xml = 根.转字符串()
writeFileSync(内容xml路径, '<?xml version="1.0" encoding="UTF-8"?>\n' + 新xml, 'utf8')

// 论文必须按页看:显式要求文档以**页面视图**打开(`settings.xml` 的 w:view = print)
const 字节 = new 回写器({
  raw: join(目录, 'raw', '原文档.docx'),
  内容xml: readFileSync(内容xml路径, 'utf8'),
  视图: 'print'
}).造()
const 输出 = join(目录, '论文格式.docx')
writeFileSync(输出, 字节)

console.log('排版完成:', 输出, `(${(字节.length / 1024).toFixed(1)} KB)`)
console.log('改动统计:', JSON.stringify(改动))
if (改动.跳过只读) console.log(`注:${改动.跳过只读} 个只读段落(含域/图表/批注)保持原样`)
console.log('查看方式:已把文档默认视图设为**页面视图**,打开即按页显示(若仍是一张长纸,手动切 视图 → 页面视图)。')

// —————————— 规则实现 ——————————

/** 页面设置 */
function 设置页面 (节点) {
  设置(节点, 页面)
  改动.分节++
}

/** 一个段落(或表格格里的段落) */
function 排段落 (节点, 深度, 在表格 = false) {
  if (节点.属性('readonly') === '1') { 改动.跳过只读++; return }

  // 首字下沉:版式不动,只把字号收到一号(26pt),看起来是有意为之而不是失控
  if (节点.属性('frame-drop')) {
    改run(节点, '26pt', 字体.正文)
    设置(节点, { 'w:ind-firstLine': undefined, 'w:spacing-before': '0pt', 'w:spacing-after': '0pt', 'w:jc': 'left' })
    改动.段落++
    return
  }

  const 样式 = 节点.属性('pStyle') || ''
  const 文本 = 节点.子.filter(c => c.名 === 'r').map(c => c.子.filter(x => x.名 === 't').map(x => x.文本()).join('')).join('')
  const 是空段 = 文本.trim() === ''

  if (在表格) {
    // 表格内:五号、不缩进、单倍行距
    设置(节点, { 'w:ind-firstLine': undefined, 'w:spacing-line': '1x', 'w:spacing-before': '0pt', 'w:spacing-after': '0pt', 'w:jc': 'left' })
    改run(节点, 字号.图表题注, 字体.正文)
    改动.表格格++
    return
  }

  // 论文标题
  if (/^Title$/i.test(样式)) {
    设置(节点, {
      'w:jc': 'center',
      'w:spacing-line': '1.5x',
      'w:spacing-before': '0pt',
      'w:spacing-after': '18pt',
      'w:ind-firstLine': undefined,
      'w:keepNext': '1'
    })
    改run(节点, 字号.论文标题, 字体.标题)
    改动.标题++
    return
  }

  // 一级标题(章):居中、黑体 16pt、章前分页
  if (/^heading 1$/i.test(样式) || /^Heading1$/.test(样式)) {
    章序号++
    设置(节点, {
      'w:jc': 'center',
      'w:spacing-line': '1.5x',
      'w:spacing-before': '18pt',
      'w:spacing-after': '12pt',
      'w:ind-firstLine': undefined,
      'w:keepNext': '1',
      // 章前分页:只用 `pageBreakBefore`(段前分页)。
      // 不要再叠硬分页符 —— 两者同时存在会多出一整页空白。
      ...(章序号 > 1 ? { 'w:pageBreakBefore': '1' } : {})
    })
    改run(节点, 字号.一级, 字体.标题)
    改动.标题++
    return
  }

  // 二级标题
  if (/^heading 2$/i.test(样式) || /^Heading2$/.test(样式)) {
    设置(节点, {
      'w:jc': 'left',
      'w:spacing-line': '1.5x',
      'w:spacing-before': '12pt',
      'w:spacing-after': '6pt',
      'w:ind-firstLine': undefined,
      'w:keepNext': '1'
    })
    改run(节点, 字号.二级, 字体.标题)
    改动.标题++
    return
  }

  // 三级标题及以下
  if (/^heading [3-6]$/i.test(样式) || /^Heading[3-6]$/.test(样式)) {
    设置(节点, { 'w:jc': 'left', 'w:spacing-before': '6pt', 'w:spacing-after': '6pt', 'w:ind-firstLine': undefined, 'w:keepNext': '1' })
    改run(节点, 字号.三级, 字体.标题)
    改动.标题++
    return
  }

  // 图表题注:居中、五号、段前段后小间距
  if (表头.test(文本.trim()) || /^Caption$/i.test(样式)) {
    设置(节点, { 'w:jc': 'center', 'w:spacing-line': '1x', 'w:spacing-before': '3pt', 'w:spacing-after': '6pt', 'w:ind-firstLine': undefined })
    改run(节点, 字号.图表题注, 字体.正文, false, 'center')
    改动.段落++
    return
  }

  // 纯图片段:居中、不缩进
  const 只有图 = 节点.子.some(c => c.名 === 'r' && c.子.some(x => x.名 === 'drawing')) && 是空段
  if (只有图) {
    设置(节点, { 'w:jc': 'center', 'w:ind-firstLine': undefined, 'w:spacing-line': '1x', 'w:spacing-before': '6pt', 'w:spacing-after': '6pt' })
    改动.段落++
    return
  }

  // 空段落:压掉多余间距
  if (是空段) {
    设置(节点, { 'w:spacing-line': '1x', 'w:spacing-before': '0pt', 'w:spacing-after': '0pt', 'w:ind-firstLine': undefined })
    return
  }

  // 正文:两端对齐、1.5 倍行距、首行缩进 2 字符(12pt×2 = 24pt)、段后 6pt
  设置(节点, {
    'w:jc': 'both',
    'w:spacing-line': '1.5x',
    'w:spacing-before': '0pt',
    'w:spacing-after': '6pt',
    'w:ind-firstLine': '24pt'
  })
  改run(节点, 字号.正文, 字体.正文)
  改动.段落++
}

/** 表格:整体居中;首行(表头)加粗,每格段落按表内规则排 */
function 排表格 (节点, 深度) {
  设置(节点, { 'w:jc': 'center' })
  let 首行 = true
  for (const 行 of 节点.子) {
    if (行.名 !== 'tr') continue
    const 是表头行 = 首行 || 行.属性('header') === '1'
    for (const 格 of 行.子) {
      if (格.名 !== 'tc') continue
      for (const 段 of 格.子) {
        if (段.名 === 'tbl') { 排表格(段, 深度 + 1); continue } // 嵌套表
        if (段.名 !== 'p') continue
        排段落(段, 深度 + 1, true)
        if (是表头行) 改run(段, 字号.图表题注, 字体.正文, true)
      }
    }
    首行 = false
  }
}

/** 给段落里的每个 run 套字号、字体与颜色(论文正文一律黑色,压掉原文档的蓝色标题) */
function 改run (段落, 号, 字, 加粗 = false) {
  for (const r of 段落.子) {
    if (r.名 !== 'r') continue
    设置(r, { 'w:sz': 号, 'w:font': 字, 'w:color': '#000000', ...(加粗 ? { 'w:b': '1' } : {}) })
  }
}

/** 写属性:undefined 表示删掉 */
function 设置 (节点, 表) {
  节点.属性列表 = 节点.属性列表.filter(([键]) => !Object.prototype.hasOwnProperty.call(表, 键))
  for (const [键, 值] of Object.entries(表)) {
    if (值 !== undefined && 值 !== null) 节点.属性列表.push([键, String(值)])
  }
}
