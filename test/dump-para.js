/**
 * 打印 docx 主文档里符合特征的前几段 XML(排错用)。
 * 用法:node test/dump-para.js <docx> [数量]
 */

import { OoxmlPackage } from '../src/ooxml/package.js'

const 文件 = process.argv[2]
const 数量 = Number(process.argv[3] || 3)
if (!文件) { console.error('用法:node test/dump-para.js <docx> [数量]'); process.exit(1) }

const 包 = OoxmlPackage.打开文件(文件)
const 文本 = 包.文本(包.主文档路径())
const 段 = 文本.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []
console.log('总段落:', 段.length)

let 打印 = 0
for (const s of 段) {
  if (!/<w:t[ >]/.test(s)) continue
  console.log('\n───', 打印 + 1, '───')
  console.log(s.replace(/\s+/g, ' ').slice(0, 420))
  if (++打印 >= 数量) break
}
