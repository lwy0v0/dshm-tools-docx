/**
 * 拓展插件验收:非 docx 输入 → docx 规范化。
 *
 * 重点验三件事:
 * 1. **按魔数判定**,不信后缀(改名的 RTF 要拦下);
 * 2. `.doc` 能真的转出可解析的 docx(端到端,不是只看有没有报错);
 * 3. 有损信息进了 `不可得`,manifest 记得住来源。
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { 判定输入, 嗅探容器 } from '../src/import/office.js'
import { 转换 } from '../src/pipeline.js'
import { 测试项目根, 新建夹具目录 } from './workspace.js'

const 本目录 = fileURLToPath(new URL('.', import.meta.url))
const 样本doc = join(本目录, 'sample5.doc')
const 样本docx = join(本目录, 'sample1.docx')
const 项目根 = 测试项目根()

let 通过 = 0
function 断言 (名, 执行) {
  try {
    执行()
    通过++
    console.log(`  ✓ ${名}`)
  } catch (e) {
    console.error(`  ✗ ${名}\n    ${e.message}`)
    throw e
  }
}

console.log('== 1. 嗅探与判定 ==')
断言('sample5.doc 是 OLE 容器', () => assert.equal(嗅探容器(样本doc), 'ole'))
断言('sample1.docx 是 ZIP 容器', () => assert.equal(嗅探容器(样本docx), 'zip'))
断言('.doc 需要规范化', () => {
  const d = 判定输入(样本doc)
  assert.equal(d.需要规范化, true)
  assert.equal(d.格式, 'doc')
  assert.equal(d.不支持, undefined)
})
断言('.docx 不需要规范化', () => {
  const d = 判定输入(样本docx)
  assert.equal(d.需要规范化, false)
  assert.equal(d.不支持, undefined)
})

console.log('\n== 2. 假后缀要拦下(按魔数,不信后缀) ==')
const 夹具 = 新建夹具目录('import')
const 假doc = join(夹具, '改名的RTF.doc')
writeFileSync(假doc, '{\\rtf1\\ansi\\deff0 hello}', 'latin1')
断言('RTF 改名成 .doc 被拒', () => {
  const d = 判定输入(假doc)
  assert.ok(d.不支持, '应给出不支持原因')
  assert.match(d.不支持, /RTF|OLE/)
})

const 假docx = join(夹具, '真doc改的.docx')
writeFileSync(假docx, readFileSync(样本doc))  // 拿真 .doc 冒充 .docx
断言('.doc 改名成 .docx 被识别为需要规范化', () => {
  const d = 判定输入(假docx)
  assert.equal(d.需要规范化, true, '应按内容认出这是 OLE,而不是当 docx 直接解析')
  assert.equal(d.实际是, 'doc')
})

断言('真 PDF 交给分类器处理(不再一刀切拒绝)', () => {
  const 假pdf = join(夹具, '随便.pdf')
  writeFileSync(假pdf, '%PDF-1.7\n', 'latin1')
  const d = 判定输入(假pdf)
  assert.equal(d.格式, 'pdf')
  assert.equal(d.需要规范化, true, 'PDF 要先分类再决定,不能在校验层就拒')
  assert.equal(d.不支持, undefined)
})

断言('后缀是 .pdf 但内容不是 PDF 会被拒', () => {
  const 假pdf = join(夹具, '其实是RTF.pdf')
  writeFileSync(假pdf, '{\\rtf1\\ansi hello}', 'latin1')
  const d = 判定输入(假pdf)
  assert.ok(d.不支持, '应给出不支持原因')
})

console.log('\n== 3. 端到端:.doc → docx → 块对象 ==')
const 结果 = await 转换({ 文件: 样本doc, 项目根, 强制: true })
断言('返回里带规范化信息', () => {
  assert.ok(结果.规范化, '应该记录规范化来源')
  assert.equal(结果.规范化.原始格式, 'doc')
  assert.equal(结果.规范化.后端, 'native')
})
断言('产物目录里有正文与清单', () => {
  assert.ok(existsSync(join(结果.产物根, 'content.md')))
  assert.ok(existsSync(join(结果.产物根, 'index.md')))
  assert.ok(existsSync(join(结果.产物根, 'manifest.json')))
})
断言('正文有实际内容(不是空壳)', () => {
  const 正文 = readFileSync(结果.全文, 'utf8')
  assert.ok(正文.length > 500, `正文只有 ${正文.length} 字符`)
  // 这份样本的开头是 "Word Specification Sample"
  assert.match(正文, /Word Specification Sample/)
})
断言('manifest 记录了来源与中间文件', () => {
  const 清单 = JSON.parse(readFileSync(join(结果.产物根, 'manifest.json'), 'utf8'))
  assert.equal(清单.规范化.引擎, 'libreoffice-kit')
  assert.equal(清单.规范化.原始格式, 'doc')
  assert.equal(清单.规范化.中间文件, '_source.docx')
  assert.ok(existsSync(join(结果.产物根, '_source.docx')), '中间 docx 应留在产物目录里')
})
断言('有损性写进了「不可得」', () => {
  const 清单 = JSON.parse(readFileSync(join(结果.产物根, 'manifest.json'), 'utf8'))
  assert.ok(Array.isArray(清单.不可得))
  assert.ok(
    清单.不可得.some(x => /规范化/.test(x.原因 || '')),
    '应有一条说明"由 doc 规范化而来"的不可得项,实际:' + JSON.stringify(清单.不可得)
  )
})

console.log('\n== 4. 缓存:同源文件不该再起引擎 ==')
const 二回 = await 转换({ 文件: 样本doc, 项目根 })
断言('第二次命中缓存', () => assert.equal(二回.命中缓存, true))
断言('命中缓存仍能报出来源', () => assert.equal(二回.规范化?.原始格式, 'doc'))

console.log(`\n全部通过:${通过} 项断言。`)
