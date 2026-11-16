/**
 * 把"解析结果的对象模型"打印成一张表(块级 + 行内片段)。
 *
 * 用途:给别人看"解析层到底吐出什么",也用来在改字段时快速对照。
 * 用法:node test/dump-model.js [docx路径]
 */

import { OoxmlPackage } from '../src/ooxml/package.js'
import { WordContext } from '../src/word/context.js'
import { 文档解析器 } from '../src/word/document.js'

const 文件 = process.argv[2] || 'test/sample1.docx'
const 包 = OoxmlPackage.打开文件(文件)
const 上下文 = new WordContext({
  包,
  主文档: 包.主文档路径(),
  选项: { 导出图片: true },
  媒体: { 取: () => ({ 相对路径: 'media/001.png', 类型: 'image/png' }) }
})
const 结果 = new 文档解析器(上下文).解析()

/** 块 + 片段的字段汇总 */
const 块字段 = new Map() // 类型 → Set<字段>
const 块例子 = new Map()
const 片段字段 = new Map()
const 片段例子 = new Map()
let 块数 = 0
let 片段数 = 0

function 简 (值, 深 = 0) {
  if (深 > 2) return '…'
  if (Array.isArray(值)) {
    if (!值.length) return []
    return [简(值[0], 深 + 1), `…共${值.length}项`]
  }
  if (值 && typeof 值 === 'object') {
    const 出 = {}
    for (const [k, v] of Object.entries(值)) {
      if (typeof v === 'string' && v.length > 28) 出[k] = v.slice(0, 28) + '…'
      else if (typeof v === 'object' && v !== null) 出[k] = 简(v, 深 + 1)
      else 出[k] = v
    }
    return 出
  }
  return 值
}

function 记块 (块) {
  块数++
  if (!块字段.has(块.类型)) { 块字段.set(块.类型, new Set()); 块例子.set(块.类型, 块) }
  for (const k of Object.keys(块)) 块字段.get(块.类型).add(k)
  if (块.片段) for (const f of 块.片段) 记片段(f)
  if (Array.isArray(块.块)) for (const b of 块.块) 记块(b)
  if (Array.isArray(块.行)) for (const 行 of 块.行) for (const 格 of 行.格) for (const b of 格.块) 记块(b)
  if (Array.isArray(块.项)) for (const 项 of 块.项) for (const b of 项.块) 记块(b)
}

function 记片段 (f) {
  片段数++
  if (!片段字段.has(f.种类)) { 片段字段.set(f.种类, new Set()); 片段例子.set(f.种类, f) }
  for (const k of Object.keys(f)) 片段字段.get(f.种类).add(k)
}

for (const 块 of 结果.块) 记块(块)

console.log(`# 解析结果的对象模型\n`)
console.log(`来源:\`${文件}\` —— ${块数} 个块、${片段数} 个行内片段\n`)
console.log(`## 一、块(块与块之间用 \`类型\` 区分)\n`)
console.log('| 类型 | 字段 | 例子 |')
console.log('| --- | --- | --- |')
for (const [类型, 字段集] of 块字段) {
  const 例 = JSON.stringify(简(块例子.get(类型))).replace(/\|/g, '\\|')
  console.log(`| ${类型} | ${[...字段集].join(' / ')} | \`${例.length > 260 ? 例.slice(0, 260) + '…' : 例}\` |`)
}
console.log(`\n## 二、行内片段(块里的 \`片段\` 数组,用 \`种类\` 区分)\n`)
console.log('| 种类 | 字段 | 例子 |')
console.log('| --- | --- | --- |')
for (const [种类, 字段集] of 片段字段) {
  const 例 = JSON.stringify(简(片段例子.get(种类))).replace(/\|/g, '\\|')
  console.log(`| ${种类} | ${[...字段集].join(' / ')} | \`${例.length > 220 ? 例.slice(0, 220) + '…' : 例}\` |`)
}
