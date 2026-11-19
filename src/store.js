/**
 * 产物存储:目录、缓存命中判断、落盘。
 *
 * 产物是**可再生缓存**:目录名带源文件指纹,manifest 记指纹与选项,变了就换目录。
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { 产物目录名, 产物目录前缀, 项目产物根, 壳子产物根 } from './paths.js'
import { 可用 } from './output/manifest.js'
import { 版本 } from './version.js'

export class 产物存储 {
  /**
   * @param {{项目根?:string, 存储根?:string}} 参数 二选一:项目根(推荐)或显式存储根
   */
  constructor ({ 项目根, 存储根 } = {}) {
    this.根 = 存储根 || (项目根 ? 项目产物根(项目根) : 壳子产物根())
    this.来源 = 项目根 ? `项目:${项目根}` : '壳子'
  }

  /** 源文件指纹 */
  static 指纹 (源文件) {
    const 字节 = readFileSync(源文件)
    const sha256 = createHash('sha256').update(字节).digest('hex')
    const st = statSync(源文件)
    return { sha256, 大小: st.size, mtime: st.mtime.toISOString() }
  }

  /**
   * 本次该用的产物目录。
   *
   * 目录名带时间码(`文档名-20261118-2230-pdf2docx`),这样产物越积越多时也能一眼
   * 看出哪份是哪次导的。但**不能因此让缓存失效**,所以先按前缀扫一遍已有目录,
   * 谁的 manifest 指纹/选项/版本都对得上就复用谁;都对不上才用当前时间新建。
   */
  目录 (源文件, sha256, 选项 = {}) {
    const 复用 = this.找已有目录(源文件, sha256, 选项)
    if (复用) return 复用
    return join(this.根, 产物目录名(源文件, 选项))
  }

  /** 扫同前缀的已有目录,返回第一个"还能用"的;没有就 null */
  找已有目录 (源文件, sha256, 选项 = {}) {
    if (!existsSync(this.根)) return null
    const 前缀 = `${产物目录前缀(源文件, 选项)}-`
    let 名们 = []
    try {
      名们 = readdirSync(this.根)
    } catch {
      return null
    }
    for (const 名 of 名们) {
      if (!名.startsWith(前缀)) continue
      const 目录 = join(this.根, 名)
      if (!this.命中(目录, { sha256, 版本, 选项 })) continue
      return 目录
    }
    return null
  }

  /** 命中检查:返回旧清单或 null */
  命中 (目录, { sha256, 版本, 选项 }) {
    const 清单路径 = join(目录, 'manifest.json')
    if (!existsSync(清单路径)) return null
    try {
      const 旧 = JSON.parse(readFileSync(清单路径, 'utf8'))
      return 可用(旧, { sha256, 版本, 选项 }) ? 旧 : null
    } catch {
      return null
    }
  }

  /** 建目录 */
  准备 (目录) {
    mkdirSync(目录, { recursive: true })
    mkdirSync(join(目录, 'chapters'), { recursive: true })
    mkdirSync(join(目录, 'media'), { recursive: true })
    return 目录
  }

  /** 写文本文件 */
  写 (目录, 相对路径, 内容) {
    const 全 = join(目录, 相对路径)
    mkdirSync(join(全, '..'), { recursive: true })
    writeFileSync(全, 内容, 'utf8')
    return 全
  }

  /** 写二进制文件(媒体、raw 母版) */
  写二进制 (目录, 相对路径, 字节) {
    const 全 = join(目录, 相对路径)
    mkdirSync(join(全, '..'), { recursive: true })
    writeFileSync(全, 字节)
    return 全
  }

  /** 列出本项目已转换的文档 */
  列表 () {
    if (!existsSync(this.根)) return []
    const 出 = []
    for (const 名 of readdirSync(this.根)) {
      const 清单 = join(this.根, 名, 'manifest.json')
      if (!existsSync(清单)) continue
      try {
        const m = JSON.parse(readFileSync(清单, 'utf8'))
        出.push({ 目录: join(this.根, 名), 源: m.源?.路径, 统计: m.统计, 转换时间: m.转换时间 })
      } catch { /* 忽略坏清单 */ }
    }
    return 出
  }
}
