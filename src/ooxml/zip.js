/**
 * 极简 ZIP 读取器(只读,零依赖)。
 *
 * 为什么不用现成库:本仓约定「零运行时依赖、能单独装进官方 profile」。
 * ZIP 只需要「中央目录 + inflateRaw」两件事,Node 自带 node:zlib 就够。
 *
 * 支持:store(0)、deflate(8)。不支持加密、ZIP64(超出 4GB 的 docx 不存在)。
 */

import { inflateRawSync } from 'node:zlib'

const 签名 = {
  本地头: 0x04034b50,
  中央目录: 0x02014b50,
  中央目录结尾: 0x06054b50,
  ZIP64定位: 0x07064b50
}

export class ZipError extends Error {}

/**
 * @typedef {object} ZipEntry
 * @property {string} 名        包内路径(如 `word/document.xml`)
 * @property {number} 方法      压缩方法
 * @property {number} 压缩大小
 * @property {number} 原始大小
 * @property {number} 本地头偏移
 */

export class Zip {
  /** @param {Buffer} buf */
  constructor (buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 22) throw new ZipError('不是有效的 ZIP:内容太短')
    this.缓冲 = buf
    /** @type {Map<string, ZipEntry>} */
    this.条目 = new Map()
    this.#读中央目录()
  }

  /** 包内所有条目名 */
  列出 () {
    return [...this.条目.keys()]
  }

  有 (名) {
    return this.条目.has(归一化(名))
  }

  /**
   * 取原始字节;不存在返回 null。
   * @param {string} 名
   * @returns {Buffer|null}
   */
  取 (名) {
    const 项 = this.条目.get(归一化(名))
    if (!项) return null
    return this.#解压(项)
  }

  /**
   * 取文本(按 UTF-8 解码,剥 BOM)。
   * @param {string} 名
   */
  取文本 (名) {
    const 字节 = this.取(名)
    if (字节 === null) return null
    return 字节.toString('utf8').replace(/^\uFEFF/, '')
  }

  #读中央目录 () {
    const buf = this.缓冲
    // 从尾部往回找 EOCD(最多 64KB 注释 + 22 字节固定头)
    let eocd = -1
    const 起点 = Math.max(0, buf.length - 22 - 0xffff)
    for (let i = buf.length - 22; i >= 起点; i--) {
      if (buf.readUInt32LE(i) === 签名.中央目录结尾) { eocd = i; break }
    }
    if (eocd < 0) throw new ZipError('不是有效的 ZIP:找不到中央目录结尾记录')

    const 条目数 = buf.readUInt16LE(eocd + 10)
    const 目录偏移 = buf.readUInt32LE(eocd + 16)
    if (目录偏移 === 0xffffffff || 条目数 === 0xffff) {
      throw new ZipError('不支持 ZIP64(疑似超过 4GB 的包)')
    }

    let p = 目录偏移
    for (let n = 0; n < 条目数; n++) {
      if (buf.readUInt32LE(p) !== 签名.中央目录) {
        throw new ZipError(`中央目录第 ${n + 1} 条签名不对,包可能损坏`)
      }
      const 方法 = buf.readUInt16LE(p + 10)
      const 压缩大小 = buf.readUInt32LE(p + 20)
      const 原始大小 = buf.readUInt32LE(p + 24)
      const 名长 = buf.readUInt16LE(p + 28)
      const 扩展长 = buf.readUInt16LE(p + 30)
      const 注释长 = buf.readUInt16LE(p + 32)
      const 本地头偏移 = buf.readUInt32LE(p + 42)
      const 名 = buf.toString('utf8', p + 46, p + 46 + 名长)
      this.条目.set(归一化(名), { 名: 归一化(名), 方法, 压缩大小, 原始大小, 本地头偏移 })
      p += 46 + 名长 + 扩展长 + 注释长
    }
  }

  /** @param {ZipEntry} 项 */
  #解压 (项) {
    const buf = this.缓冲
    const 头 = 项.本地头偏移
    if (buf.readUInt32LE(头) !== 签名.本地头) throw new ZipError(`本地文件头损坏:${项.名}`)
    const 名长 = buf.readUInt16LE(头 + 26)
    const 扩展长 = buf.readUInt16LE(头 + 28)
    const 起 = 头 + 30 + 名长 + 扩展长
    const 原始 = buf.subarray(起, 起 + 项.压缩大小)
    if (项.方法 === 0) return Buffer.from(原始)
    if (项.方法 === 8) {
      try {
        return inflateRawSync(原始)
      } catch (e) {
        throw new ZipError(`解压失败 ${项.名}:${e.message}`)
      }
    }
    throw new ZipError(`不支持的压缩方法 ${项.方法}(${项.名})`)
  }
}

/** 包内路径统一:反斜杠转正斜杠、去掉开头的 ./ 与 / */
function 归一化 (名) {
  return String(名).replace(/\\/g, '/').replace(/^\.?\//, '')
}

/**
 * 从缓冲区打开。
 * @param {Buffer} buf
 */
export function 打开Zip (buf) {
  return new Zip(buf)
}
