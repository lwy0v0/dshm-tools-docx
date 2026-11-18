/**
 * PDF 的分类与规范化。
 *
 * 两件事:
 * 1. **分类**(纯 Node,零依赖):解压内容流数文本操作符,判断是"文本型"还是"图片型"。
 *    判据只看**文本操作符密度**,不看图片数量 —— 图文混排的文档图片很多但文本层完好,
 *    扫描件才是真的没有 Tj。早期按图片数判会把产品手册误判成扫描件。
 * 2. **规范化**(要 Python):文本型 PDF 交给 pdf2docx 转成 docx,再走已有解析链路。
 *    图片型 PDF 没有文本层,必须 OCR,不在本模块能力内(明确拒绝,不假装成功)。
 */

import { closeSync, openSync, readFileSync, readSync } from 'node:fs'
import { inflateSync, constants } from 'node:zlib'
import { DocError } from '../ooxml/package.js'
import { 跑Python } from './python.js'

/** 每页文本操作符数低于此值 → 视为没有文本层 */
const 文本密度阈值 = 10
/** 全文档最多解压多少个流(防御畸形/超大 PDF) */
const 最多流数 = 20_000

/**
 * 分类一份 PDF。
 *
 * @param {string} 文件 绝对路径
 * @returns {{
 *   类型: 'text'|'image'|'mixed', 页数: number, 文本操作符: number,
 *   每页文本: number, 图像数: number, 每页图像: number, 依据: string
 * }}
 */
export function 分类PDF (文件) {
  const buf = readFileSync(文件)
  const s = buf.toString('latin1')

  if (!s.startsWith('%PDF-')) {
    throw new DocError(`不是 PDF(文件头不是 %PDF-):${文件}`, 'UNSUPPORTED')
  }
  // 加密的 PDF 解不开内容流,分类会失真 —— 直接说清楚
  if (/\/Encrypt\b/.test(s)) {
    return {
      类型: 'text',
      页数: 数页数(s),
      文本操作符: 0,
      每页文本: 0,
      图像数: 0,
      每页图像: 0,
      依据: '文档带 /Encrypt 加密字典,无法解压内容流分类;若转换失败多半是加密所致'
    }
  }

  // 页数:现代 PDF 常把页面对象塞进压缩对象流(ObjStm),明文里数不到,
  // 所以还要把解压后的内容也扫一遍,取两者较大值。
  let 明文页数 = 数页数(s)
  let 压缩页数 = 0
  let 文本操作符 = 0
  let 图像数 = 0
  let 看到流 = 0
  let 解压失败 = 0

  const re = /stream\r?\n/g
  let m
  while ((m = re.exec(s)) !== null && 看到流 < 最多流数) {
    const 字典 = s.slice(s.lastIndexOf('<<', m.index), m.index)
    const 终点 = s.indexOf('endstream', m.index)
    if (终点 === -1) break
    const 原始 = buf.subarray(m.index + m[0].length, 终点)

    let 解压
    try {
      解压 = inflateSync(原始, { finishFlush: constants.Z_SYNC_FLUSH })
    } catch {
      // 图像流通常是 DCTDecode/JPXDecode,压不出来,但字典已标明身份
      if (/\/Subtype\s*\/Image/.test(字典)) {
        图像数++
        continue
      }
      // 没有 Filter 的流本来就是明文(content stream 允许不压缩)
      if (!/\/Filter/.test(字典)) {
        解压 = 原始
      } else {
        解压失败++
        continue
      }
    }
    看到流++

    if (/\/Subtype\s*\/Image/.test(字典)) {
      // 图像流也可能被 Flate 压过
      图像数++
      continue
    }
    const 文 = 解压.toString('latin1')
    // 解压后的对象流里可能藏着页面对象
    压缩页数 += (文.match(/\/Type\s*\/Page(?![s])/g) ?? []).length
    if (文.includes('beginbfchar') || 文.includes('beginbfrange')) continue // CMap,不是正文
    文本操作符 += (文.match(/\bT[Jj]\b/g) ?? []).length
  }

  const 页数 = Math.max(明文页数, 压缩页数)
  const 每页文本 = 页数 ? 文本操作符 / 页数 : 文本操作符
  const 每页图像 = 页数 ? 图像数 / 页数 : 图像数

  let 类型
  let 依据
  if (每页文本 < 文本密度阈值) {
    类型 = 'image'
    依据 = `每页仅 ${每页文本.toFixed(1)} 个文本操作符(阈值 ${文本密度阈值}),没有可用文本层 —— 这是扫描件/图片型 PDF`
  } else if (每页图像 >= 1) {
    类型 = 'mixed'
    依据 = `每页 ${每页文本.toFixed(0)} 个文本操作符(有文本层),但每页 ${每页图像.toFixed(1)} 张图 —— 图文混排`
  } else {
    类型 = 'text'
    依据 = `每页 ${每页文本.toFixed(0)} 个文本操作符,可直接取文本层`
  }
  if (解压失败 && 图像数 === 0) 依据 += `;另有 ${解压失败} 个流解压失败(多为图像或异常流)`
  if (压缩页数 > 明文页数) 依据 += `;页对象藏在压缩对象流里,页数取自解压内容(${页数} 页)`
  if (页数 === 0) 依据 += ';⚠ 数不到页数,「每页」指标失真,本分类仅供参考'

  return { 类型, 页数, 文本操作符, 每页文本, 图像数, 每页图像, 依据 }
}

/** 粗数页数:数 `/Type /Page`(不解析 Pages 树,只用于给密度一个分母) */
function 数页数 (s) {
  const 命中 = s.match(/\/Type\s*\/Page(?![s])/g)
  return 命中 ? 命中.length : 0
}

/** 喂给 Python 的转换代码(参数走 sys.argv,不经 shell) */
const 转换代码 = [
  'import sys',
  'from pdf2docx import Converter',
  'cv = Converter(sys.argv[1])',
  'try:',
  '    cv.convert(sys.argv[2])',
  'finally:',
  '    cv.close()'
].join('\n')

/** 探测 pdf2docx 是否可用(装没装、能不能 import) */
export async function 探测pdf2docx () {
  const 结果 = await 跑Python({ 代码: 'import pdf2docx', 超时: 60_000 })
  if (结果.成功) return { 可用: true }
  const 尾巴 = String(结果.日志 || 结果.说明 || '').trim().split('\n').slice(-2).join(' / ')
  return { 可用: false, 原因: 尾巴 || '未知原因' }
}

/**
 * 用 pdf2docx 把文本型 PDF 转成 docx。
 *
 * @param {{输入:string, 输出:string, 超时?:number}} 参数
 */
export async function 规范化为docx_PDF ({ 输入, 输出, 超时 = 600_000 }) {
  const 探测 = await 探测pdf2docx()
  if (!探测.可用) {
    throw new DocError(
      '把 PDF 转成 docx 需要 Python 包 pdf2docx,但当前不可用:' + 探测.原因 +
      '。安装:pip install pdf2docx',
      'NOADAPTER'
    )
  }
  const 结果 = await 跑Python({ 代码: 转换代码, 参数: [输入, 输出], 超时 })
  if (!结果.成功) {
    const 细节 = 结果.超时
      ? `转换超时(${Math.round(超时 / 1000)}s)`
      : String(结果.日志 || 结果.说明 || '').trim().split('\n').slice(-3).join(' / ')
    throw new DocError('PDF 转 docx 失败(pdf2docx):' + (细节 || '未知原因'), 'CONVERT_FAILED')
  }
  return { 引擎: 'pdf2docx', 后端: 'python', 缺失字体: [] }
}
