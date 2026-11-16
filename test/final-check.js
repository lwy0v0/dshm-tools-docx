/**
 * 输出一份交付前自检:结构、页面、分页、颜色、字号。
 * 用法:node test/final-check.js <docx>
 */

import { OoxmlPackage } from '../src/ooxml/package.js'

const 文件 = process.argv[2]
if (!文件) { console.error('用法:node test/final-check.js <docx>'); process.exit(1) }

const 包 = OoxmlPackage.打开文件(文件)
const t = 包.文本(包.主文档路径())
const 计 = (re) => (t.match(new RegExp(re.source, 'g')) || []).length
const 段们 = t.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []

console.log('文件:', 文件)
console.log('结构 : w:body =', /<w:body[ >]/.test(t) ? '有' : '缺失!')
console.log('页面 : A4 =', /<w:pgSz w:w="11906" w:h="16838"\/>/.test(t))
console.log('      ', (t.match(/<w:pgMar[^>]*>/) || [''])[0])
console.log('      ', (t.match(/<w:docGrid[^>]*>/) || [''])[0])
console.log('分页 : pageBreakBefore =', 计(/<w:pageBreakBefore\/>/), '处')
const 分页章 = 段们.filter(s => s.includes('<w:pageBreakBefore/>'))
console.log('       带分页的标题 pPr =', (分页章[0]?.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0])
const 颜色 = [...new Set((t.match(/<w:color w:val="([0-9A-Fa-f]{6})"/g) || []))]
console.log('颜色 :', 颜色.length ? 颜色.join(' ') : '(无显式颜色)')
const 字号 = {}
for (const m of t.matchAll(/<w:sz w:val="(\d+)"\/>/g)) 字号[m[1] / 2] = (字号[m[1] / 2] || 0) + 1
console.log('字号 :', JSON.stringify(字号))
