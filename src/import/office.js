/**
 * 拓展插件:非 docx 的 Office 文件 → docx 规范化。
 *
 * 用 `@deepseek-ai/libreoffice-kit`(自带预编译 LibreOffice 引擎)把
 * `.doc` / `.odt` 归一成标准 `.docx`,随后交给 pipeline 走**同一条**解析链路。
 * 用户无需安装 LibreOffice / WPS / Python。
 *
 * 两件事必须守住:
 * 1. **按魔数判定,不信后缀** —— kit 只接受真正的 OLE 复合文档;
 *    改了后缀的 RTF/HTML 要在这里拦下并说清原因,不能让用户看到 `invalid-document`。
 * 2. **丢的东西要能上报** —— 字体被替换会让字形变化,交回 pipeline 写进 `不可得`。
 */

import { closeSync, existsSync, openSync, readSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DocError } from '../ooxml/package.js'

/** kit 自带的转换矩阵里、能产出 docx 的输入格式 */
const 可转格式 = new Map([
  ['doc', 'Word 97-2003 二进制'],
  ['odt', 'OpenDocument 文本']
])

/** 容器魔数 → 人话 */
const 魔数表 = [
  { 名: 'ole', 字节: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 说明: 'OLE 复合文档' },
  { 名: 'zip', 字节: [0x50, 0x4b, 0x03, 0x04], 说明: 'ZIP 容器' },
  { 名: 'pdf', 字节: [0x25, 0x50, 0x44, 0x46, 0x2d], 说明: 'PDF' }
]

/** 读文件头几个字节(不整读,大文件也不吃亏) */
function 读头 (文件, 字节数 = 8) {
  const fd = openSync(文件, 'r')
  try {
    const 缓冲 = Buffer.alloc(字节数)
    const 读到 = readSync(fd, 缓冲, 0, 字节数, 0)
    return 缓冲.subarray(0, 读到)
  } finally {
    closeSync(fd)
  }
}

/** 容器类型:ole | zip | pdf | rtf | 空 | unknown */
export function 嗅探容器 (文件) {
  const 头 = 读头(文件, 8)
  if (头.length >= 5 && 头.subarray(0, 5).toString('latin1') === '{\\rtf') return 'rtf'
  for (const 项 of 魔数表) {
    if (头.length < 项.字节.length) continue
    if (项.字节.every((b, i) => 头[i] === b)) return 项.名
  }
  if (头.length === 0) return '空'
  return 'unknown'
}

/**
 * 判定一份输入该怎么处理(同步,只看头和后缀,不做任何转换)。
 *
 * @param {string} 文件 绝对路径
 * @returns {{格式:string, 容器:string, 需要规范化:boolean, 不支持?:string}}
 */
export function 判定输入 (文件) {
  const 后缀 = (文件.match(/\.([^.\\/]+)$/) || [])[1]?.toLowerCase() || ''
  const 容器 = 嗅探容器(文件)

  // 后缀是 docx,但内容不是 ZIP —— 典型是 .doc 改名
  if (后缀 === 'docx') {
    if (容器 === 'zip') return { 格式: 'docx', 容器, 需要规范化: false }
    if (容器 === 'ole') return { 格式: 'docx', 容器, 需要规范化: true, 实际是: 'doc' }
    return {
      格式: 'docx',
      容器,
      需要规范化: false,
      不支持: `后缀是 .docx,但内容不是 docx(容器:${容器})。可能被改过后缀,请确认原文件格式:${文件}`
    }
  }

  // PDF:交给 pdf.js 先分类再决定走哪条路(文本型→pdf2docx,图片型→明确拒绝)
  if (后缀 === 'pdf' || 容器 === 'pdf') {
    if (容器 !== 'pdf') {
      return {
        格式: 'pdf',
        容器,
        需要规范化: false,
        不支持: `后缀是 .pdf 但内容不是 PDF(容器:${容器}),请确认原文件:${文件}`
      }
    }
    return { 格式: 'pdf', 容器, 需要规范化: true }
  }

  if (!可转格式.has(后缀)) {
    return {
      格式: 后缀,
      容器,
      需要规范化: false,
      不支持: `本转换器支持的输入:docx / doc / odt / pdf;当前后缀:${后缀 || '(无)'}:${文件}`
    }
  }

  // doc 必须是真正的 OLE;改后缀的 RTF/HTML 要在协议层就拒掉
  if (后缀 === 'doc' && 容器 !== 'ole') {
    return {
      格式: 'doc',
      容器,
      需要规范化: false,
      不支持: `这是改了后缀的 ${容器 === 'rtf' ? 'RTF' : 容器 === 'zip' ? 'ZIP(可能是 docx)' : '未知'} 文件,不是 Word 97-2003 二进制格式;` +
        '引擎只接受 OLE 复合文档。请用 Word/WPS 另存为真正的 .doc 或 .docx 后重试:' + 文件
    }
  }
  if (后缀 === 'odt' && 容器 !== 'zip') {
    return { 格式: 'odt', 容器, 需要规范化: false, 不支持: `后缀是 .odt 但内容不是 ZIP 容器(${容器}):${文件}` }
  }

  return { 格式: 后缀, 容器, 需要规范化: true }
}

/**
 * 转换引擎的候选入口。
 *
 * 本包以 `link:` 形式挂进 profile,真实路径在开发目录,Node 的裸说明符解析
 * **看不到** profile 的 node_modules,所以这里显式探几条路:
 * 1. DSH profile 的 node_modules(插件实际运行环境);
 * 2. 从本模块向上逐级找 node_modules(包自带依赖或独立测试时)。
 */
function 候选入口 () {
  const 出 = []
  const 家 = process.env.DSH_HOME || join(homedir(), '.dsh')
  const 档 = join(家, 'profiles')
  try {
    for (const 名 of readdirSync(档)) {
      出.push(join(档, 名, 'node_modules', '@deepseek-ai', 'libreoffice-kit', 'lib', 'index.js'))
    }
  } catch { /* 没有 profiles 目录就走后面的候选 */ }

  let 目录 = dirname(fileURLToPath(import.meta.url))
  for (let 层 = 0; 层 < 8; 层++) {
    出.push(join(目录, 'node_modules', '@deepseek-ai', 'libreoffice-kit', 'lib', 'index.js'))
    const 上 = dirname(目录)
    if (上 === 目录) break
    目录 = 上
  }
  return [...new Set(出)]
}

/** 懒加载转换引擎:没装/加载失败时给出能照着做的中文提示 */
let 引擎 = null
async function 载入引擎 () {
  if (引擎) return 引擎

  // 先试裸说明符(将来把 kit 作为本包依赖直装时就是这条路)
  try {
    引擎 = await import('@deepseek-ai/libreoffice-kit')
    return 引擎
  } catch { /* 继续探测 */ }

  for (const 入口 of 候选入口()) {
    if (!existsSync(入口)) continue
    try {
      引擎 = await import(pathToFileURL(入口).href)
      return 引擎
    } catch { /* 换下一个候选 */ }
  }

  throw new DocError(
    '转换 .doc/.odt 需要 @deepseek-ai/libreoffice-kit(自带 LibreOffice 引擎),但找不到可用的引擎。' +
    '请确认该包已安装(随桌面应用一起分发),或把 .doc 另存为 .docx 后再转。',
    'NOADAPTER'
  )
}

/** kit 的错误码 → 中文原因 */
function 译错误 (e, 输入) {
  const 码 = e && e.code
  const 映射 = {
    'unsupported-format': `格式组合不受支持(引擎不接受该输入)`,
    'invalid-document': '文件结构损坏或不是引擎认识的 Office 文档',
    'input-too-large': '文件超过引擎的输入大小上限',
    'output-too-large': '转换结果超过引擎的输出大小上限',
    timeout: '转换超时',
    unavailable: 'LibreOffice 引擎不可用(平台引擎包缺失或损坏)',
    failed: '引擎转换失败'
  }
  const 原因 = 映射[码] || `引擎报错${码 ? `(${码})` : ''}`
  return new DocError(`规范化失败:${原因}:${输入}${e && e.message ? ` —— ${e.message}` : ''}`, 'CONVERT_FAILED')
}

/**
 * 把一个非 docx 文件转成 docx。
 *
 * kit 的硬约束:输入输出都必须是绝对路径,且**输出路径不能已存在**。
 *
 * @param {{输入:string, 输出:string, timeoutMs?:number}} 参数
 * @returns {Promise<{后端:string, 缺失字体:string[], 引擎:string}>}
 */
export async function 规范化为docx ({ 输入, 输出, timeoutMs = 120_000 }) {
  if (!existsSync(输入)) throw new DocError(`文件不存在:${输入}`, 'ENOENT')
  if (existsSync(输出)) throw new DocError(`内部错误:规范化目标已存在,拒绝覆盖:${输出}`, 'EEXIST')

  const { createConverter } = await 载入引擎()

  let 转换器
  try {
    转换器 = await createConverter({ timeoutMs })
  } catch (e) {
    throw new DocError(
      'LibreOffice 引擎启动失败:' + (e && e.message ? e.message : String(e)) +
      '。Windows 需要系统安装 VC++ v14 运行库与匹配架构的 Node。',
      'NOADAPTER'
    )
  }

  try {
    const 结果 = await 转换器.convert({ inputPath: 输入, outputPath: 输出 })
    return {
      后端: 结果.backend,
      缺失字体: Array.isArray(结果.missingFonts) ? 结果.missingFonts : [],
      引擎: 'libreoffice-kit'
    }
  } catch (e) {
    throw 译错误(e, 输入)
  } finally {
    // 释放会等进程/worker 退出并清临时文件;失败也要放掉
    await 转换器.dispose().catch(() => {})
  }
}

export { 可转格式 }
