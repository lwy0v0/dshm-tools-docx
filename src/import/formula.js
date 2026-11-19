/**
 * 公式提取:从原 PDF 里定位公式区域并裁成图片。
 *
 * 为什么要有这一步:pdf2docx 不认识公式(源码里没有 equation/OMML 概念),
 * 它会把公式碎成字符塞进表格,上下标与分式结构全丢。
 * 所以公式只能在 pdf2docx 之外、直接从原 PDF 上抠图 —— 图保住了,结构交给后续 OCR/模型读图。
 *
 * 定位靠字体:Word/OMML 与 LaTeX 渲出来的数学符号(√ ∑ ∫ 等)使用 OpenSymbol 一类字体,
 * 以它们为锚点聚成区域再裁剪。纯斜体公式(如 y=ax+b)没有特殊符号,当前检不出。
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { 跑Python } from './python.js'

const 脚本路径 = join(dirname(fileURLToPath(import.meta.url)), 'scripts', 'formula_extract.py')
const OCR脚本路径 = join(dirname(fileURLToPath(import.meta.url)), 'scripts', 'formula_ocr.py')

/**
 * 从 PDF 中提取公式图片。
 *
 * @param {{pdf:string, 输出目录:string, 超时?:number}} 参数
 * @returns {Promise<{ok:boolean, 公式数:number, 清单路径:string|null, 原因?:string}>}
 */
export async function 提取公式图 ({ pdf, 输出目录, 超时 = 300_000 }) {
  if (!existsSync(脚本路径)) {
    return { ok: false, 公式数: 0, 清单路径: null, 原因: `内部错误:公式提取脚本缺失 ${脚本路径}` }
  }

  const 结果 = await 跑Python({
    代码: `import runpy; runpy.run_path(r"${脚本路径}", run_name="__main__")`,
    参数: [pdf, 输出目录],
    超时
  })

  const 清单路径 = join(输出目录, 'formulas.json')
  if (!结果.成功) {
    const 细节 = 结果.超时
      ? '公式提取超时'
      : String(结果.日志 || 结果.说明 || '').trim().split('\n').slice(-2).join(' / ')
    return { ok: false, 公式数: 0, 清单路径: null, 原因: 细节 || '未知原因' }
  }

  // 公式提取失败不应该让整次转换失败 —— 它是增强项,不是主链路
  if (!existsSync(清单路径)) {
    return { ok: false, 公式数: 0, 清单路径: null, 原因: '脚本跑完但没有产出 formulas.json' }
  }

  let 公式数 = 0
  try {
    const { readFileSync } = await import('node:fs')
    const 清单 = JSON.parse(readFileSync(清单路径, 'utf8'))
    公式数 = Number(清单.公式数) || 0
  } catch { /* 清单坏了就当 0 */ }

  return { ok: true, 公式数, 清单路径 }
}

/**
 * 公式图 → LaTeX(pix2tex) → OMML → 写进 docx 成为**可编辑的 Word 公式**;
 * 顺带做两件与公式无关但同样属于版式的事:拆掉 pdf2docx 的"排版容器表格"、
 * 把边缘竖排短文还原成竖排文本框。
 *
 * @param {{产物目录:string, docx:string, pdf?:string, 超时?:number}} 参数
 *   pdf 给定时才能重建竖排文本框(需要 PDF 原始坐标)。
 * @returns {Promise<{ok:boolean, 识别数:number, 总数:number, 写回docx:boolean, 原因?:string}>}
 */
export async function 公式OCR ({ 产物目录, docx, pdf = null, 超时 = 1_800_000 }) {
  if (!existsSync(OCR脚本路径)) {
    return { ok: false, 识别数: 0, 总数: 0, 写回docx: false, 原因: `公式识别脚本缺失 ${OCR脚本路径}` }
  }

  const 参数 = [产物目录, docx]
  if (pdf) 参数.push(pdf)
  const 结果 = await 跑Python({
    代码: `import runpy; runpy.run_path(r"${OCR脚本路径}", run_name="__main__")`,
    参数,
    超时
  })

  if (!结果.成功) {
    const 细节 = 结果.超时
      ? '公式识别超时'
      : String(结果.日志 || 结果.说明 || '').trim().split('\n').slice(-3).join(' / ')
    return { ok: false, 识别数: 0, 总数: 0, 写回docx: false, 原因: 细节 || '未知原因' }
  }

  // 脚本往 stdout 打一行 JSON(中文可能被控制台编码搞坏,所以优先读 formulas.json)
  try {
    const { readFileSync } = await import('node:fs')
    const 清单 = JSON.parse(readFileSync(join(产物目录, 'formulas.json'), 'utf8'))
    const 公式们 = 清单.公式 || []
    const 识别数 = 公式们.filter(f => f.latex && f.omml).length
    return {
      ok: true,
      识别数,
      总数: 公式们.length,
      写回docx: 识别数 > 0 && !清单.写回失败,
      ...(清单.写回失败 ? { 原因: String(清单.写回失败).slice(0, 200) } : {})
    }
  } catch (e) {
    return { ok: false, 识别数: 0, 总数: 0, 写回docx: false, 原因: String(e && e.message ? e.message : e) }
  }
}
