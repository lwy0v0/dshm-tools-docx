/**
 * 端到端验收:造夹具 → 转换 → 打印产物,人工看有没有丢内容。
 */

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { 造夹具 } from './fixtures.js'
import { 写夹具文件 } from './write.js'
import { 测试项目根, 新建夹具目录 } from './workspace.js'
import { 转换 } from '../src/pipeline.js'

const 项目根 = 测试项目根()
const 根 = 新建夹具目录('convert')
mkdirSync(根, { recursive: true })

const 源 = join(根, '夹具.docx')
写夹具文件(源, 造夹具())

const 结果 = await 转换({ 文件: 源, 项目根 })
console.log('=== 返回摘要 ===')
console.log(JSON.stringify(结果, null, 2))

const 产物根 = 结果.产物根
console.log('\n=== 产物文件 ===')
for (const 名 of 走(产物根)) console.log(' ', 名)

console.log('\n=== content.md ===')
console.log(readFileSync(join(产物根, 'content.md'), 'utf8'))

console.log('\n=== index.md ===')
console.log(readFileSync(join(产物根, 'index.md'), 'utf8'))

function 走 (目录) {
  const 出 = []
  for (const 项 of readdirSync(目录, { withFileTypes: true })) {
    if (项.isDirectory()) for (const x of 走(join(目录, 项.name))) 出.push(`${项.name}/${x}`)
    else 出.push(项.name)
  }
  return 出
}
