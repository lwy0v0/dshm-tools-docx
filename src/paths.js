/**
 * 路径规则:**唯一**拼产物路径的地方(见 `dshm-desktop/docs/存储布局.md` §7)。
 *
 * 包名 `dshm-tools-docx` → 去 `dshm-`、再去分类前缀 `tools-` → `docx`。
 * (§3 规则:分类前缀不承载语义,不占目录段;撞名时才回填。)
 * 项目里落 `<项目根>/.dshm/docx/`;壳子存储(本插件不用)落 `~/.dshm/docx/`。
 */

import { join, resolve, isAbsolute } from 'node:path'
import { homedir } from 'node:os'

/** 包名 → 存储子路径(去 dshm- 与 tools- 分类前缀) */
export function 插件子路径 () {
  return 'docx'
}

/** 项目存储根:`<项目根>/.dshm/doc` */
export function 项目产物根 (项目根) {
  if (!项目根) throw new Error('缺少项目根:必须显式传项目路径,不能猜当前目录')
  const 根 = isAbsolute(项目根) ? 项目根 : resolve(项目根)
  return join(根, '.dshm', 插件子路径())
}

/** 壳子存储根:`~/.dshm/doc`($DSHM_HOME 可换;本插件不用) */
export function 壳子产物根 () {
  const 根 = process.env.DSHM_HOME || join(homedir(), '.dshm')
  return join(根, 插件子路径())
}

/**
 * 目录名:`<文件名清洗>-<sha8>`,再按选项加后缀 —— 多个版本要能**并存**。
 * - 解析器 → `-pymupdf4llm`(非 docx 输入才有;同一份 PDF 换解析器各占一个目录,便于对照)
 * - 带样式 → `-样式`
 * - 可编辑 → `-编辑`
 * - 两个都要 → `-样式编辑`
 *
 * @param {string} 源文件
 * @param {string} sha256
 * @param {{带样式?:boolean, 可编辑?:boolean, 解析器?:string}} [选项]
 */
/**
 * 产物目录名的**固定前缀**(不含时间码),用于"找这份源文件的已有产物"。
 *
 * @param {string} 源文件
 * @param {{带样式?:boolean, 可编辑?:boolean, 解析器?:string}} [选项]
 */
export function 产物目录前缀 (源文件, 选项 = {}) {
  const 基 = 源文件.split(/[\\/]/).pop() || 'doc'
  const 去扩展 = 基.replace(/\.[^.]+$/, '')
  // 前导点会被当成隐藏目录,顺手去掉
  return 去扩展.replace(/^\.+/, '').replace(/[^\w\u4e00-\u9fa5.\-]/g, '_').slice(0, 60) || 'doc'
}

/** 时间码:`20261118-2230`(目录名里用,一眼看出是哪次导出的) */
export function 时间码 (时间 = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${时间.getFullYear()}${p(时间.getMonth() + 1)}${p(时间.getDate())}` +
    `-${p(时间.getHours())}${p(时间.getMinutes())}`
}

/**
 * 产物目录名:`<文档名>-<时间码>-<解析器><标记>`。
 *
 * **不再带 sha256 前缀**:那串十六进制对人是噪声,而且产物越积越多时分不清哪个是
 * 哪次导的。缓存是否复用改由 store.js 扫目录 + 比对 manifest 里的指纹决定
 * (见 产物存储.目录),所以目录名可以纯为可读性服务。
 *
 * 后缀约定:
 * - 解析器 → `-pdf2docx`
 * - 带样式 → `-样式`
 * - 可编辑 → `-编辑`
 * - 两个都要 → `-样式编辑`
 *
 * @param {string} 源文件
 * @param {{带样式?:boolean, 可编辑?:boolean, 解析器?:string}} [选项]
 * @param {Date} [时间]
 */
export function 产物目录名 (源文件, 选项 = {}, 时间 = new Date()) {
  const 干净 = 产物目录前缀(源文件, 选项)
  const 解析器段 = 选项.解析器 ? `-${String(选项.解析器).replace(/[^\w.\-]/g, '_')}` : ''
  const 标记 = [选项.带样式 ? '样式' : '', 选项.可编辑 ? '编辑' : ''].filter(Boolean).join('')
  const 后缀 = 标记 ? `-${标记}` : ''
  return `${干净}-${时间码(时间)}${解析器段}${后缀}`
}

/** sha256 前 8 位(内部比对、日志里用) */
export function 短指纹 (sha256) {
  return String(sha256).slice(0, 8)
}
