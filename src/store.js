/**
 * 产物存储:目录、缓存命中判断、落盘。
 *
 * 产物是**可再生缓存**:目录名带源文件指纹,manifest 记指纹与选项,变了就换目录。
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { 产物目录名, 项目产物根, 壳子产物根 } from './paths.js'
import { 可用 } from './output/manifest.js'

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

  /** 本次应使用的产物目录(带样式版本加 `-样式` 后缀,与纯文本版并存) */
  目录 (源文件, sha256, 选项 = {}) {
    return join(this.根, 产物目录名(源文件, sha256, 选项))
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
