/**
 * PDF 路径验收:先分类,再决定能不能转。
 *
 * 三条底线:
 * 1. 分类看**文本操作符密度**,不看图片数量(图文混排 ≠ 扫描件);
 * 2. 图片型 PDF 必须**明确拒绝**,不能假装转成功;
 * 3. 文本型 PDF 能真的转出中文正文(端到端,需要样本与 pdf2docx)。
 *
 * 端到端用可选样本:放 `test/sample*.pdf` 或设 `DSHM_TEST_PDF`,
 * 都没有就跳过(不把用户文档提交进仓库)。
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { 分类PDF, 探测pdf2docx } from '../src/import/pdf.js'
import { 判定输入 } from '../src/import/office.js'
import { 找Python } from '../src/import/python.js'
import { 转换 } from '../src/pipeline.js'
import { 测试项目根, 新建夹具目录 } from './workspace.js'

const 本目录 = fileURLToPath(new URL('.', import.meta.url))
const 项目根 = 测试项目根()
const 夹具 = 新建夹具目录('pdf')

let 通过 = 0
let 跳过 = 0
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
async function 断言异步 (名, 执行) {
  try {
    await 执行()
    通过++
    console.log(`  ✓ ${名}`)
  } catch (e) {
    console.error(`  ✗ ${名}\n    ${e.message}`)
    throw e
  }
}

/** 造一份"结构可信"的 PDF 文本(只为喂分类器,不要求是合法 PDF) */
function 造PDF (内容, 名) {
  const 路径 = join(夹具, 名)
  writeFileSync(路径, `%PDF-1.7\n${内容}\n%%EOF\n`, 'latin1')
  return 路径
}

console.log('== 1. 分类判据 ==')
// 文本型:每页 20 个 Tj,远超阈值
const 文本型 = 造PDF([
  '1 0 obj <</Type /Page /Contents 2 0 R>> endobj',
  '2 0 obj <</Length 99>> stream',
  'BT /F1 12 Tf 72 720 Td (Hello) Tj ' + ' (x) Tj'.repeat(19) + ' ET',
  'endstream endobj'
].join('\n'), '文本型.pdf')

// 图片型:有 Image XObject、没有任何 Tj
const 图片型 = 造PDF([
  '1 0 obj <</Type /Page /Resources <</XObject <</Im1 3 0 R>>>>>> endobj',
  '3 0 obj <</Type /XObject /Subtype /Image /Width 100 /Height 100 /Filter /DCTDecode>> stream',
  '\xff\xd8\xff\xe0 fake jpeg bytes',
  'endstream endobj'
].join('\n'), '图片型.pdf')

断言('文本型 PDF 判为 text', () => {
  const c = 分类PDF(文本型)
  assert.equal(c.类型, 'text', c.依据)
  assert.ok(c.每页文本 >= 10)
})
断言('无文本层的 PDF 判为 image', () => {
  const c = 分类PDF(图片型)
  assert.equal(c.类型, 'image', c.依据)
  assert.equal(c.文本操作符, 0)
})
断言('判定:PDF 需要规范化', () => {
  const d = 判定输入(文本型)
  assert.equal(d.格式, 'pdf')
  assert.equal(d.需要规范化, true)
})

console.log('\n== 2. 图片型必须明确拒绝 ==')
await 断言异步('转换图片型 PDF 抛 UNSUPPORTED 且说明要 OCR', async () => {
  let 抓到 = null
  try {
    await 转换({ 文件: 图片型, 项目根, 强制: true })
  } catch (e) {
    抓到 = e
  }
  assert.ok(抓到, '应该抛错')
  assert.equal(抓到.代码 || 抓到.code, 'UNSUPPORTED')
  assert.match(抓到.message, /OCR|扫描件|文本层/)
})

console.log('\n== 3. Python / pdf2docx ==')
const 解释器 = 找Python()
console.log(`  Python: ${解释器 || '(未找到)'}`)
const 探测 = await 探测pdf2docx()
console.log(`  pdf2docx: ${探测.可用 ? '可用' : '不可用'}`)

if (!探测.可用) {
  console.log('\n  ⚠ 跳过端到端:pdf2docx 不可用(pip install pdf2docx)')
  跳过++
} else {
  // 找样本:test/sample*.pdf 优先,其次 DSHM_TEST_PDF
  let 样本 = null
  for (const 名 of readdirSync(本目录)) {
    if (/^sample.*\.pdf$/i.test(名)) { 样本 = join(本目录, 名); break }
  }
  if (!样本 && process.env.DSHM_TEST_PDF && existsSync(process.env.DSHM_TEST_PDF)) {
    样本 = process.env.DSHM_TEST_PDF
  }

  if (!样本) {
    console.log('\n  ⚠ 跳过端到端:没有样本。放一份到 test/sample.pdf 或设 DSHM_TEST_PDF')
    跳过++
  } else {
    console.log(`\n== 4. 端到端:${样本.split('\\').pop()} ==`)
    const 分类 = 分类PDF(样本)
    console.log(`  分类:${分类.类型}(${分类.依据})`)
    const 结果 = await 转换({ 文件: 样本, 项目根, 强制: true })
    断言('默认解析器是 pdf2docx(还原版式),且记录了来源与分类', () => {
      assert.equal(结果.规范化.原始格式, 'pdf')
      assert.equal(结果.规范化.引擎, 'pdf2docx')
      assert.ok(结果.规范化.PDF分类, '应带 PDF 分类信息')
    })
    断言('产物目录名带解析器标识', () => {
      assert.match(结果.产物根, /-pdf2docx$/, `目录名应带解析器:${结果.产物根}`)
    })
    断言('正文非空且是中文可读内容', () => {
      const 正文 = readFileSync(结果.全文, 'utf8')
      assert.ok(正文.length > 500, `正文只有 ${正文.length} 字符`)
      const 汉字数 = (正文.match(/[\u4e00-\u9fa5]/g) ?? []).length
      assert.ok(汉字数 > 100, `汉字只认出 ${汉字数} 个,可能乱码`)
    })
    断言('manifest 记录了 PDF 分类', () => {
      const 清单 = JSON.parse(readFileSync(join(结果.产物根, 'manifest.json'), 'utf8'))
      assert.equal(清单.规范化.引擎, 'pdf2docx')
      assert.ok(清单.规范化.PDF分类)
    })

    // 只启用 pdf2docx:其他解析器实现放在 .test/(不进版本库),传进来必须报错
    console.log('\n== 5. 未启用的解析器必须报错 ==')
    await 断言异步('传未启用的解析器 → 报错并列出可选', async () => {
      await assert.rejects(
        () => 转换({ 文件: 样本, 项目根, 强制: true, PDF解析器: 'pymupdf4llm' }),
        /pdf2docx/,
        '报错里要列出可用解析器'
      )
    })
  }
}

console.log(`\n通过 ${通过} 项断言${跳过 ? `,跳过 ${跳过} 组` : ''}。`)
