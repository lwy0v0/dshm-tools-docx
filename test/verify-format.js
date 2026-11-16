/**
 * 校验"只改格式、不动文字":把排版后的 docx 转回来,与原产物的 content.md 逐行比。
 * 用法:node test/verify-format.js <原产物目录> <排版后 docx>
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { 转换 } from '../src/pipeline.js'
import { 测试项目根 } from './workspace.js'

const [原产物, 排版后] = process.argv.slice(2)
if (!原产物 || !排版后) {
  console.error('用法:node test/verify-format.js <原产物目录> <排版后 docx>')
  process.exit(1)
}

/** Markdown 的强调标记属于"格式",比文字时要抹掉;分节描述是页面设置,排版本就会变 */
const 规范化 = (文本) => 文本.split('\n')
  .filter(l => !l.startsWith('<!-- ') && !l.trim().startsWith('> 〔分节:') && l.trim() !== '')
  .map(l => l.trim().replace(/\*\*|(?<!\*)\*(?!\*)|~~/g, ''))

const 原 = 规范化(readFileSync(join(原产物, 'content.md'), 'utf8'))
const 结果 = await 转换({ 文件: 排版后, 项目根: 测试项目根(), 强制: true })
const 新 = 规范化(readFileSync(join(结果.产物根, 'content.md'), 'utf8'))

const 一致 = 原.length === 新.length && 原.every((l, i) => l === 新[i])
console.log(`文字:原 ${原.length} 行 / 排版后 ${新.length} 行 → ${一致 ? '✅ 一致(只改了格式)' : '❌ 有文字变化'}`)
if (!一致) {
  const 长 = Math.max(原.length, 新.length)
  let 报 = 0
  for (let i = 0; i < 长 && 报 < 5; i++) {
    if (原[i] !== 新[i]) {
      console.log(`  行${i + 1}\n    原: ${原[i]}\n    新: ${新[i]}`)
      报++
    }
  }
  process.exitCode = 1
}
