/**
 * 打印包含指定字号 run 的整段 XML(排错用)。
 * 用法:node test/find-size.js <docx> <半磅值> [xml]
 */

import { OoxmlPackage } from '../src/ooxml/package.js'

const [文件, 半磅, 模式] = process.argv.slice(2)
if (!文件 || !半磅) { console.error('用法:node test/find-size.js <docx> <半磅值> [xml]'); process.exit(1) }

const 包 = OoxmlPackage.打开文件(文件)
const 文本 = 包.文本(包.主文档路径())
const 段们 = 文本.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []

for (const 段 of 段们) {
  if (!new RegExp(`<w:sz w:val="${半磅}"/>`).test(段)) continue
  if (模式 === 'xml') {
    console.log(段.replace(/\s+/g, ' ').slice(0, 900), '\n')
    continue
  }
  const 字 = (段.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []).map(s => s.replace(/<[^>]+>/g, '')).join('')
  const 样式 = (段.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '(无)'
  console.log(`样式=${样式} | 文本=${JSON.stringify(字.slice(0, 60))}`)
}
