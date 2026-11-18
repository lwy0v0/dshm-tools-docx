/**
 * 整份 PDF 全量转换:跑完整链路(转 docx → 提公式 → 识别 → 写回),看整体效果。
 *
 * 和 单页.mjs 的分工:单页用于快速迭代(20~40 秒),这个是"整篇过一遍",
 * 用来暴露只在长文档上才出现的问题(伪公式、编号匹配不上、识别超时等)。
 *
 * 用法:node test/整份.mjs [源PDF]
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const 插件根 = 'D:\\APP\\dsh\\doc\\dshm-tools-docx'
const 源 = process.argv[2] || 'D:\\APP\\dsh\\.test-paper.pdf'

if (!existsSync(源)) {
  console.error(`源文件不存在:${源}`)
  process.exit(1)
}

const { 转换 } = await import(`file:///${插件根.replace(/\\/g, '/')}/src/pipeline.js`)
const t0 = Date.now()
const r = await 转换({ 文件: 源, 项目根: 'D:\\APP\\dsh', 强制: true, 转换超时: 1_800_000 })
console.log(`整份转换 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log('产物:', r.产物根)
console.log('公式图:', JSON.stringify(r.规范化?.公式图))
console.log('公式OCR:', JSON.stringify(r.规范化?.公式OCR))

const 清单路径 = join(r.产物根, 'formulas.json')
if (!existsSync(清单路径)) {
  console.log('\n没有 formulas.json —— 这份 PDF 里没提到公式')
  process.exit(0)
}

const j = JSON.parse(readFileSync(清单路径, 'utf8'))
console.log(`\n公式 ${j.公式数} | 原位替换 ${j.原位替换数 ?? '?'} | 清理碎片 ${j.清理碎片数 ?? '?'} | 剩余追加 ${j.剩余追加数 ?? '?'}`)
if (j.写回失败) console.log('写回失败:', j.写回失败)

const 表 = j.公式.map(f => {
  const 页 = String(f.页).padStart(3)
  const 号 = String(f.编号 ?? '-').padStart(3)
  const 态 = f.已原位替换 ? '原位' : (f.latex && f.omml ? '附录' : '失败')
  return `  p${页} (${号}) ${态}  ${(f.latex || f.识别失败 || '(未识别)').slice(0, 70)}`
})
console.log(表.join('\n'))

const 未识别 = j.公式.filter(f => !f.latex || !f.omml)
if (未识别.length) {
  console.log(`\n未识别 ${未识别.length} 个:`)
  for (const f of 未识别) console.log(`  p${f.页} (${f.编号 ?? '-'}) ${f.识别失败 || ''}`)
}
