/**
 * 测试用的极简 ZIP 写入器(deflate)。
 * 只给测试夹具与验收脚本用,不进产物路径;生产读取侧在 `src/ooxml/zip.js`。
 */

import { deflateRawSync, crc32 } from 'node:zlib'

/**
 * @param {Record<string, string|Buffer>} 条目 名 → 内容
 * @returns {Buffer}
 */
export function 写Zip (条目) {
  const 块 = []
  const 中央 = []
  let 偏移 = 0
  const 名单 = Object.keys(条目)

  for (const 名 of 名单) {
    const 内容 = 条目[名]
    const 原名 = Buffer.from(名.replace(/\\/g, '/'), 'utf8')
    const 数据 = Buffer.isBuffer(内容) ? 内容 : Buffer.from(内容, 'utf8')
    const 压缩 = deflateRawSync(数据)
    const 校验 = crc32(数据)

    const 本地 = Buffer.alloc(30)
    本地.writeUInt32LE(0x04034b50, 0)
    本地.writeUInt16LE(20, 4)
    本地.writeUInt16LE(0x0800, 6) // 文件名 UTF-8
    本地.writeUInt16LE(8, 8) // deflate
    本地.writeUInt32LE(校验, 14)
    本地.writeUInt32LE(压缩.length, 18)
    本地.writeUInt32LE(数据.length, 22)
    本地.writeUInt16LE(原名.length, 26)
    块.push(本地, 原名, 压缩)

    const 中 = Buffer.alloc(46)
    中.writeUInt32LE(0x02014b50, 0)
    中.writeUInt16LE(20, 4)
    中.writeUInt16LE(20, 6)
    中.writeUInt16LE(0x0800, 8)
    中.writeUInt16LE(8, 10)
    中.writeUInt32LE(校验, 16)
    中.writeUInt32LE(压缩.length, 20)
    中.writeUInt32LE(数据.length, 24)
    中.writeUInt16LE(原名.length, 28)
    中.writeUInt32LE(偏移, 42)
    中央.push(中, 原名)

    偏移 += 本地.length + 原名.length + 压缩.length
  }

  const 中央缓冲 = Buffer.concat(中央)
  const 结尾 = Buffer.alloc(22)
  结尾.writeUInt32LE(0x06054b50, 0)
  结尾.writeUInt16LE(名单.length, 8)
  结尾.writeUInt16LE(名单.length, 10)
  结尾.writeUInt32LE(中央缓冲.length, 12)
  结尾.writeUInt32LE(偏移, 16)

  return Buffer.concat([...块, 中央缓冲, 结尾])
}
