/**
 * 检查一份 docx 的排版要素(页面设置、段落/字符格式统计),用于验证"论文格式"是否落地。
 * 用法:node test/inspect-docx.js <docx>
 */

import { OoxmlPackage } from '../src/ooxml/package.js'

const 文件 = process.argv[2]
if (!文件) { console.error('用法:node test/inspect-docx.js <docx>'); process.exit(1) }

const 包 = OoxmlPackage.打开文件(文件)
const 文本 = 包.文本(包.主文档路径())

const 取 = (re) => (文本.match(re) || [])[0] || '(无)'
/** 计数:必须带 g,否则 match 返回的是"匹配详情数组",不是匹配次数 */
const 计 = (re) => (文本.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || []).length

console.log('文件:', 文件)
console.log('── 页面 ──')
console.log('pgSz   :', 取(/<w:pgSz[^>]*>/))
console.log('pgMar  :', 取(/<w:pgMar[^>]*>/))
console.log('docGrid:', 取(/<w:docGrid[^>]*>/))
console.log('pgNum  :', 取(/<w:pgNumType[^>]*>/))
console.log('titlePg:', 文本.includes('<w:titlePg/>') ? '首页不同' : '(未设)')
console.log('── 段落 ──')
console.log('居中 :', 计(/<w:jc w:val="center"\/>/), '处')
console.log('两端 :', 计(/<w:jc w:val="both"\/>/), '处')
console.log('1.5倍:', 计(/<w:spacing[^>]*w:line="360"[^>]*w:lineRule="auto"/), '处')
console.log('首行 :', 计(/<w:ind[^>]*w:firstLine="480"/), '处')
console.log('── 字符 ──')
console.log('黑体 :', 计(/w:eastAsia="黑体"/g), '处')
console.log('宋体 :', 计(/w:eastAsia="宋体"/g), '处')
const 字号 = {}
for (const m of 文本.matchAll(/<w:sz w:val="(\d+)"\/>/g)) 字号[m[1] / 2] = (字号[m[1] / 2] || 0) + 1
console.log('字号分布(磅→处数):', JSON.stringify(字号))
