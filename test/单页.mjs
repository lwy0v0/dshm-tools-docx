/**
 * 单页快速验证:从整份 PDF 里抠一页出来,走完整转换链路,只为看公式效果。
 *
 * 用法:node test/单页.mjs [PDF页码] [源PDF]
 *   页码是 **PDF 的页码,从 1 开始**(注意不是转换后 docx 的页码 ——
 *   pdf2docx 会把页数改掉,两者对不上)。
 *   默认 5:arXiv 那篇论文的公式 (2)(3)(4) 在 PDF 第 5 页。
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const 插件根 = 'D:\\APP\\dsh\\doc\\dshm-tools-docx'
const 源 = process.argv[3] || 'D:\\APP\\dsh\\.test-paper.pdf'
const 页 = Number(process.argv[2] || 5)
const 单页 = `D:\\APP\\dsh\\.tmp-page${页}.pdf`

// 用插件自带的 python 抠页(它自带 pymupdf)
const py = join(插件根, 'vendor', 'python', 'python.exe')
const 代码 = [
  'import pymupdf, sys',
  `src = pymupdf.open(r"${源}")`,
  'dst = pymupdf.open()',
  `dst.insert_pdf(src, from_page=${页 - 1}, to_page=${页 - 1})`,
  `dst.save(r"${单页}")`,
  'print("ok")'
].join('; ')

execFileSync(py, ['-c', 代码], { stdio: 'ignore', timeout: 60_000 })
if (!existsSync(单页)) {
  console.error('抠页失败')
  process.exit(1)
}

const { 转换 } = await import(`file:///${插件根.replace(/\\/g, '/')}/src/pipeline.js`)
const t0 = Date.now()
const r = await 转换({ 文件: 单页, 项目根: 'D:\\APP\\dsh', 强制: true, 转换超时: 600_000 })
console.log(`单页转换 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log('产物:', r.产物根)
console.log('公式图:', JSON.stringify(r.规范化?.公式图))

const { readFileSync } = await import('node:fs')
const 清单路径 = join(r.产物根, 'formulas.json')
if (existsSync(清单路径)) {
  const j = JSON.parse(readFileSync(清单路径, 'utf8'))
  const 行 = j.公式.map(f => `  (${f.编号 ?? '-'}) ${(f.latex || '(未识别)').slice(0, 70)}`)
  console.log(`公式 ${j.公式数} | 原位替换 ${j.原位替换数 ?? '?'}\n` + 行.join('\n'))
}
