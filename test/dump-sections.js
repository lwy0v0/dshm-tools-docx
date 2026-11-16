/**
 * 把一份 docx 里所有 sectPr 与页面相关信息完整打印出来(排查"内容全在一页")。
 * 用法:node test/dump-sections.js <docx>
 */

import { OoxmlPackage } from '../src/ooxml/package.js'

const 文件 = process.argv[2]
if (!文件) { console.error('用法:node test/dump-sections.js <docx>'); process.exit(1) }

const 包 = OoxmlPackage.打开文件(文件)
const 主 = 包.文本(包.主文档路径())
const 段们 = 主.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []

console.log('文件:', 文件)
console.log('段落数:', 段们.length, '| 字符数(正文文本):',
  (主.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) || []).join('').replace(/<[^>]+>/g, '').length)

const 全 = 主.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g) || []
console.log(`\n── sectPr 共 ${全.length} 处 ──`)
全.forEach((s, i) => {
  const 在段落里 = 段们.some(段 => 段.includes(s))
  console.log(`[${i}] ${在段落里 ? '段落级(终结该节)' : 'body 级(最后一节)'}`)
  console.log('   ', s.replace(/\s+/g, ' ').slice(0, 600))
})

// 关键:正文最后一个子元素是不是 sectPr
const body尾 = 主.slice(主.lastIndexOf('<w:sectPr'))
console.log('\n正文末尾:', body尾.replace(/\s+/g, ' ').slice(0, 200))

// 有没有异常设置会让 Word 把内容挤成一页
const 计 = (re) => (主.match(new RegExp(re.source, 'g')) || []).length
console.log('\nframePr        :', 计(/<w:framePr/), '处')
console.log('textboxContent :', 计(/<w:txbxContent>/), '处')
console.log('连续分节(continuous):', 计(/<w:type w:val="continuous"\/>/), '处')
