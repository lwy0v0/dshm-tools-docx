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
 * - 带样式 → `-样式`
 * - 可编辑 → `-编辑`
 * - 两个都要 → `-样式编辑`
 *
 * @param {string} 源文件
 * @param {string} sha256
 * @param {{带样式?:boolean, 可编辑?:boolean}} [选项]
 */
export function 产物目录名 (源文件, sha256, 选项 = {}) {
  const 基 = 源文件.split(/[\\/]/).pop() || 'doc'
  const 去扩展 = 基.replace(/\.[^.]+$/, '')
  const 干净 = 去扩展.replace(/[^\w\u4e00-\u9fa5.\-]/g, '_').slice(0, 60) || 'doc'
  const 标记 = [选项.带样式 ? '样式' : '', 选项.可编辑 ? '编辑' : ''].filter(Boolean).join('')
  const 后缀 = 标记 ? `-${标记}` : ''
  return `${干净}-${sha256.slice(0, 8)}${后缀}`
}

/** sha256 前 8 位(目录名里用) */
export function 短指纹 (sha256) {
  return String(sha256).slice(0, 8)
}
