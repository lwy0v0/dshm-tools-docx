/**
 * OPC(Open Packaging Conventions)包:部件表、内容类型、关系(rels)。
 *
 * 只做 Word 需要的那部分:`[Content_Types].xml` 用来查类型、`_rels` 用来把 `r:id` 解成真目标。
 */

import { readFileSync } from 'node:fs'
import { dirname, posix } from 'node:path'
import { Zip } from './zip.js'
import { 解析Xml } from './xml.js'
import { CT, PKG_REL, REL } from './ns.js'

export class DocError extends Error {
  constructor (消息, 代码 = 'DOC_ERROR') {
    super(消息)
    this.代码 = 代码
  }
}

export class OoxmlPackage {
  /**
   * @param {Zip} zip
   */
  constructor (zip) {
    this.zip = zip
    /** @type {Map<string, import('./xml.js').XmlNode>} */
    this.部件缓存 = new Map()
    /** @type {Map<string, Record<string, {类型:string, 目标:string, 外部:boolean}>>} */
    this.关系缓存 = new Map()
    this.内容类型 = null
    this._主文档路径 = null
  }

  /**
   * 从文件路径打开。
   * @param {string} 路径
   */
  static 打开文件 (路径) {
    let 字节
    try {
      字节 = readFileSync(路径)
    } catch (e) {
      throw new DocError(`读不到文件:${路径}(${e.code || e.message})`, 'ENOENT')
    }
    return new OoxmlPackage(new Zip(字节))
  }

  /** 列出包内部件 */
  列出 () {
    return this.zip.列出()
  }

  有 (部件路径) {
    return this.zip.有(部件路径)
  }

  /** 取原始字节 */
  字节 (部件路径) {
    return this.zip.取(部件路径)
  }

  /** 取文本 */
  文本 (部件路径) {
    const s = this.zip.取文本(部件路径)
    return s === null ? null : s
  }

  /**
   * 取已解析的 XML 部件(缓存)。
   * @param {string} 部件路径
   * @returns {import('./xml.js').XmlNode|null}
   */
  xml (部件路径) {
    const 键 = 部件路径.replace(/\\/g, '/').replace(/^\//, '')
    if (this.部件缓存.has(键)) return this.部件缓存.get(键)
    const 文本 = this.文本(键)
    if (文本 === null) { this.部件缓存.set(键, null); return null }
    let 节点
    try {
      节点 = 解析Xml(文本)
    } catch (e) {
      throw new DocError(`部件 ${键} 的 XML 解析失败:${e.message}`, 'XML_INVALID')
    }
    this.部件缓存.set(键, 节点)
    return 节点
  }

  /**
   * 取关系的目标表(键为 rId)。
   * @param {string} 部件路径 rels 所属的部件;传 '' 表示包级关系
   */
  关系 (部件路径 = '') {
    const 键 = 部件路径.replace(/\\/g, '/').replace(/^\//, '')
    if (this.关系缓存.has(键)) return this.关系缓存.get(键)

    const rels路径 = 键 === '' ? '_rels/.rels' : posix.join(posix.dirname(键), '_rels', posix.basename(键) + '.rels')
    const 根 = this.xml(rels路径)
    /** @type {Record<string, {类型:string, 目标:string, 外部:boolean}>} */
    const 表 = {}
    if (根) {
      const 基准目录 = 键 === '' ? '' : posix.dirname(键)
      for (const r of 根.找全部('Relationship', PKG_REL)) {
        const id = r.属性('Id')
        const 类型 = r.属性('Type') || ''
        const 目标原文 = r.属性('Target') || ''
        const 外部 = (r.属性('TargetMode') || '').toLowerCase() === 'external'
        表[id] = {
          类型,
          目标: 外部 ? 目标原文 : 解目标(基准目录, 目标原文),
          外部
        }
      }
    }
    this.关系缓存.set(键, 表)
    return 表
  }

  /** 按关系类型后缀找目标(第一个命中) */
  按类型找 (类型后缀, 所属部件 = '') {
    for (const r of Object.values(this.关系(所属部件))) {
      if (r.类型.endsWith(类型后缀) && !r.外部) return r.目标
    }
    return null
  }

  /** 主文档部件路径(通常 word/document.xml) */
  主文档路径 () {
    if (this._主文档路径) return this._主文档路径
    const 包关系 = this.关系('')
    for (const r of Object.values(包关系)) {
      if (r.类型.endsWith(REL.主文档)) { this._主文档路径 = r.目标; return r.目标 }
    }
    if (this.有('word/document.xml')) { this._主文档路径 = 'word/document.xml'; return this._主文档路径 }
    // 兜底:找第一个 content-type 是主文档的
    for (const [部件, 类型] of this.#内容类型表()) {
      if (类型.includes('wordprocessingml.document.main')) return (this._主文档路径 = 部件)
    }
    throw new DocError('包里找不到主文档(不像是 docx)', 'NOT_DOCX')
  }

  /** 该部件的 MIME,查不到回空串 */
  部件类型 (部件路径) {
    const 键 = '/' + 部件路径.replace(/\\/g, '/').replace(/^\//, '')
    for (const [部件, 类型] of this.#内容类型表()) if (部件 === 键) return 类型
    const 扩展 = 键.split('.').pop().toLowerCase()
    for (const [部件, 类型] of this.#默认类型表()) if (部件 === 扩展) return 类型
    return ''
  }

  #内容类型表 () {
    if (!this.内容类型) this.#读内容类型()
    return this.内容类型.override
  }

  #默认类型表 () {
    if (!this.内容类型) this.#读内容类型()
    return this.内容类型.default
  }

  #读内容类型 () {
    const 根 = this.xml('[Content_Types].xml')
    const override = new Map()
    const def = new Map()
    if (根) {
      for (const o of 根.找全部('Override', CT)) {
        override.set((o.属性('PartName') || '').replace(/\\/g, '/'), o.属性('ContentType') || '')
      }
      for (const d of 根.找全部('Default', CT)) {
        def.set((d.属性('Extension') || '').toLowerCase(), d.属性('ContentType') || '')
      }
    }
    this.内容类型 = { override, default: def }
  }
}

/** 把 rels 里的 Target 解成包内绝对路径 */
function 解目标 (基准目录, 目标) {
  const t = 目标.replace(/\\/g, '/')
  if (t.startsWith('/')) return t.slice(1)
  const 合 = posix.normalize(posix.join(基准目录, t))
  return 合.replace(/^\//, '')
}
