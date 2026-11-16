/**
 * ZIP 写入(deflate):把一组部件打成 docx。
 *
 * 与 `zip.js` 对称 —— 回写器最后一步就是"把部件表打成包"。
 */

import { deflateRawSync, crc32 } from 'node:zlib'

const 本地头签名 = 0x04034b50
const 中央目录签名 = 0x02014b50
const 目录尾签名 = 0x06054b50

export class ZipWriter {
  constructor () {
    /** @type {{名:string, 数据:Buffer}[]} */
    this.条目 = []
  }

  /**
   * @param {string} 名 包内路径(`word/document.xml`)
   * @param {string|Buffer} 内容
   */
  加 (名, 内容) {
    const 数据 = Buffer.isBuffer(内容) ? 内容 : Buffer.from(String(内容), 'utf8')
    this.条目.push({ 名: 名.replace(/\\/g, '/').replace(/^\//, ''), 数据 })
    return this
  }

  /** 打成 ZIP 字节 */
  打包 () {
    const 块 = []
    const 中央 = []
    let 偏移 = 0

    for (const { 名, 数据 } of this.条目) {
      const 文件名 = Buffer.from(名, 'utf8')
      const 压缩 = deflateRawSync(数据)
      const 校验 = crc32(数据)

      const 本地 = Buffer.alloc(30)
      本地.writeUInt32LE(本地头签名, 0)
      本地.writeUInt16LE(20, 4)
      本地.writeUInt16LE(0x0800, 6) // 文件名 UTF-8
      本地.writeUInt16LE(8, 8) // deflate
      本地.writeUInt32LE(校验, 14)
      本地.writeUInt32LE(压缩.length, 18)
      本地.writeUInt32LE(数据.length, 22)
      本地.writeUInt16LE(文件名.length, 26)
      块.push(本地, 文件名, 压缩)

      const 中 = Buffer.alloc(46)
      中.writeUInt32LE(中央目录签名, 0)
      中.writeUInt16LE(20, 4)
      中.writeUInt16LE(20, 6)
      中.writeUInt16LE(0x0800, 8)
      中.writeUInt16LE(8, 10)
      中.writeUInt32LE(校验, 16)
      中.writeUInt32LE(压缩.length, 20)
      中.writeUInt32LE(数据.length, 24)
      中.writeUInt16LE(文件名.length, 28)
      中.writeUInt32LE(偏移, 42)
      中央.push(中, 文件名)

      偏移 += 本地.length + 文件名.length + 压缩.length
    }

    const 中央缓冲 = Buffer.concat(中央)
    const 结尾 = Buffer.alloc(22)
    结尾.writeUInt32LE(目录尾签名, 0)
    结尾.writeUInt16LE(this.条目.length, 8)
    结尾.writeUInt16LE(this.条目.length, 10)
    结尾.writeUInt32LE(中央缓冲.length, 12)
    结尾.writeUInt32LE(偏移, 16)

    return Buffer.concat([...块, 中央缓冲, 结尾])
  }
}
