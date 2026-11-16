/**
 * 往返测试:`docx → 可编辑产物 → 回写 docx' → 再解析`,比两次的正文与统计。
 *
 * 用法:node test/roundtrip.js [docx路径]
 * 判据:两次 content.md 的**正文文字**必须一致;统计数值一致;结构差异要能解释。
 */

import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { 转换 } from '../src/pipeline.js'
import { 回写器 } from '../src/edit/build.js'
import { OoxmlPackage } from '../src/ooxml/package.js'
import { WordContext } from '../src/word/context.js'
import { 文档解析器 } from '../src/word/document.js'
import { 测试项目根, 新建夹具目录 } from './workspace.js'

const 源 = process.argv[2] || 'test/sample1.docx'
const 项目根 = 测试项目根()
const 临时 = 新建夹具目录('roundtrip')

console.log('源文件:', 源)

// 1) 第一次:转成可编辑产物
const 一 = await 转换({ 文件: 源, 项目根, 可编辑: true, 强制: true })
const 内容xml = readFileSync(join(一.产物根, 'content.xml'), 'utf8')
const raw = join(一.产物根, 'raw', '原文档.docx')
console.log('可编辑产物:', 一.产物根)

// 2) 回写
const 字节 = new 回写器({ raw, 内容xml }).造()
const 重建 = join(临时, '重建.docx')
writeFileSync(重建, 字节)
console.log('回写产物:', 重建, `(${字节.length} 字节)`)

// 3) 第二次:把回写的文件再解析一遍
const 二 = await 转换({ 文件: 重建, 项目根, 可编辑: true, 强制: true })
const 正文一 = readFileSync(join(一.产物根, 'content.md'), 'utf8')
const 正文二 = readFileSync(join(二.产物根, 'content.md'), 'utf8')

// 4) 对比:去掉生成时间戳与源文件名后逐行比
const 规范化 = (文本) => 文本
  .split('\n')
  .filter(l => !l.startsWith('<!-- ') && l.trim() !== '')
  .map(l => l.trim())

const 行一 = 规范化(正文一)
const 行二 = 规范化(正文二)
const 相同 = 行一.length === 行二.length && 行一.every((l, i) => l === 行二[i])

console.log('\n=== 对比 ===')
console.log('正文行数:原', 行一.length, '/ 回写后', 行二.length, same(行一.length, 行二.length))
console.log('正文文字一致:', 相同 ? '✅' : '❌')

if (!相同) {
  const 差异 = []
  const 长 = Math.max(行一.length, 行二.length)
  for (let i = 0; i < 长; i++) {
    if (行一[i] !== 行二[i]) 差异.push({ 行: i + 1, 原: 行一[i], 回: 行二[i] })
  }
  console.log(`差异 ${差异.length} 处,前 8 处:`)
  for (const d of 差异.slice(0, 8)) {
    console.log(`  行${d.行}\n    原: ${d.原}\n    回: ${d.回}`)
  }
}

// 5) 统计对比(段落允许 ±3:空段落与"只放对象"的段落在两次解析里计数口径略有差别)
const 容差 = { 段落: 3 }
const 键 = ['段落', '标题', '表格', '表格行', '图片', '公式', '脚注', '批注']
console.log('\n=== 统计 ===')
for (const k of 键) {
  const a = 一.统计[k]
  const b = 二.统计[k]
  const 允许 = 容差[k] || 0
  const 过 = Math.abs(a - b) <= 允许
  console.log(`${k.padEnd(4)} 原 ${a} / 回写后 ${b} ${过 ? '✅' : '❌'}${允许 && a !== b ? `(容差 ±${允许})` : ''}`)
  if (!过) process.exitCode = 1
}

if (!相同) process.exitCode = 1

// 6) 段落级对比:找出"多出来/少了"的段落(解释统计差异)
const 段落对比 = 对比段落(源, 重建)
if (段落对比.差异.length) {
  console.log('\n=== 段落差异(按文本多重集)===')
  for (const d of 段落对比.差异.slice(0, 10)) {
    console.log(`  ${d.方向} ×${d.次数}: ${JSON.stringify(d.文本.slice(0, 60))}`)
  }
}

function 对比段落 (甲, 乙) {
  const 收 = (文件) => {
    const 包 = OoxmlPackage.打开文件(文件)
    const 上下文 = new WordContext({
      包, 主文档: 包.主文档路径(), 选项: { 导出图片: false }, 媒体: { 取: () => null }
    })
    const 结果 = new 文档解析器(上下文).解析()
    const 出 = []
    const 走 = (块们) => {
      for (const 块 of 块们) {
        if (块.片段) {
          const 文本 = 块.片段.map(f => f.文本 ?? `<${f.种类}>`).join('').trim()
          if (文本) 出.push(`${块.类型}:${文本}`)
        }
        if (块.块) 走(块.块)
        if (块.行) for (const 行 of 块.行) for (const 格 of 行.格) 走(格.块)
      }
    }
    走(结果.块)
    return 出
  }
  const 计 = (arr) => {
    const m = new Map()
    for (const x of arr) m.set(x, (m.get(x) || 0) + 1)
    return m
  }
  const 甲计 = 计(收(甲))
  const 乙计 = 计(收(乙))
  const 差异 = []
  for (const [文本, 次数] of 乙计) {
    const 原次 = 甲计.get(文本) || 0
    if (次数 !== 原次) 差异.push({ 方向: '多出', 次数: 次数 - 原次, 文本 })
  }
  for (const [文本, 次数] of 甲计) {
    const 新次 = 乙计.get(文本) || 0
    if (次数 !== 新次 && 时间(差异, 文本)) 差异.push({ 方向: '少了', 次数: 新次 - 次数, 文本 })
  }
  return { 差异 }
}

/** 避免"少了"与"多出"重复报同一条 */
function 时间 (差异, 文本) {
  return !差异.some(d => d.文本 === 文本)
}

function same (a, b) {
  return a === b ? '✅' : '❌'
}
