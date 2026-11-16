/**
 * 检查分页相关标记:pageBreakBefore / 分页符 / keepNext / 页码域。
 * 用法:node test/check-pagination.js <docx>
 */

import { OoxmlPackage } from '../src/ooxml/package.js'

const 文件 = process.argv[2]
if (!文件) { console.error('用法:node test/check-pagination.js <docx>'); process.exit(1) }

const 包 = OoxmlPackage.打开文件(文件)
const 主 = 包.文本(包.主文档路径())
const 计 = (re) => (主.match(new RegExp(re.source, 'g')) || []).length

console.log('文件:', 文件)
console.log('pageBreakBefore   :', 计(/<w:pageBreakBefore\/>/), '处')
console.log('分页符 w:br page  :', 计(/<w:br[^>]*w:type="page"/), '处')
console.log('lastRenderedPageBreak:', 计(/<w:lastRenderedPageBreak\/>/), '处')
console.log('keepNext          :', 计(/<w:keepNext\/>/), '处')
console.log('一级标题(heading 1):', 计(/<w:pStyle w:val="heading 1"\/>/), '处')
console.log('sectPr            :', 计(/<w:sectPr[ >]/), '处')

// 同一段既有 pageBreakBefore 又有硬分页符 = 会多出一整页空白
const 段们 = 主.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []
const 双分页 = 段们.filter(s => s.includes('<w:pageBreakBefore/>') && s.includes('w:type="page"'))
console.log('重复分页(段前分页 + 硬分页符):', 双分页.length, '处', 双分页.length ? '⚠ 会多出空白页' : '✓')

// 逐段列出:标题前一段与标题本身的 pageBreakBefore
let 序号 = 0
for (const 段 of 段们) {
  const 样式 = (段.match(/<w:pStyle w:val="([^"]+)"/) || [])[1]
  if (/^heading 1$/.test(样式 || '')) {
    序号++
    const 有 = 段.includes('<w:pageBreakBefore/>')
    const 字 = (段.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []).map(s => s.replace(/<[^>]+>/g, '')).join('')
    console.log(`  章${序号} 分页前=${有 ? '是' : '否'} | ${JSON.stringify(字.slice(0, 40))}`)
  }
}
