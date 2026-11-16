/**
 * CFB(Compound File Binary,即 OLE2 复合文档)读取。
 *
 * `.doc` / `.xls` / `.ppt` 以及加密的 `.docx` 都是这种容器:一个文件里装着多个"流"(stream),
 * `WordDocument` 流放正文,`0Table` / `1Table` 放结构信息,`Data` 放图片…
 *
 * 布局:头(512B)→ FAT 扇区链 → 目录项树 → 每个流的扇区链(小于 4096B 的走"迷你流")。
 */

import { DocError } from '../ooxml/package.js'

const 签名 = Buffer.from('d0cf11e0a1b11ae1', 'hex')

/** 扇区号哨兵 */
const 空闲 = 0xFFFFFFFF
const 链尾 = 0xFFFFFFFE
const FAT扇区 = 0xFFFFFFFD
const DIFAT扇区 = 0xFFFFFFFC

export class CfbFile {
  /** @param {Buffer} 字节 整个文件 */
  constructor (字节) {
    if (字节.length < 512 || !字节.subarray(0, 8).equals(签名)) {
      throw new DocError('不是 OLE2 复合文档(CFB 签名不匹配)', 'NOT_CFB')
    }
    this.字节 = 字节
    this.扇区大小 = 1 << 字节.readUInt16LE(30)
    this.迷你扇区大小 = 1 << 字节.readUInt16LE(32)
    this.迷你阈值 = 字节.readUInt32LE(56)
    this.目录起始 = 字节.readUInt32LE(48)
    this.迷你FAT起始 = 字节.readUInt32LE(60)
    this.迷你FAT数量 = 字节.readUInt32LE(64)
    this.FAT = this.读FAT()
    this.条目 = this.读目录()
    this.迷你流 = this.建迷你流()
  }

  /** 按扇区号取一段原始字节 */
  扇区 (号) {
    const 起 = 512 + 号 * this.扇区大小
    if (起 + this.扇区大小 > this.字节.length) throw new DocError(`扇区号越界:${号}`, 'CFB_EOF')
    return this.字节.subarray(起, 起 + this.扇区大小)
  }

  /** 拼出 FAT:头部 109 项 + DIFAT 链 */
  读FAT () {
    const 表 = []
    for (let i = 0; i < 109; i++) {
      const v = this.字节.readUInt32LE(76 + i * 4)
      if (v !== 空闲 && v !== 链尾) 表.push(v)
    }
    let 下一个 = this.字节.readUInt32LE(68)
    let 剩余 = this.字节.readUInt32LE(72)
    const 每扇 = this.扇区大小 / 4 - 1
    while (剩余 > 0 && 下一个 !== 链尾 && 下一个 !== 空闲) {
      const 块 = this.扇区(下一个)
      for (let i = 0; i < 每扇; i++) {
        const v = 块.readUInt32LE(i * 4)
        if (v !== 空闲 && v !== 链尾) 表.push(v)
      }
      下一个 = 块.readUInt32LE(每扇 * 4)
      剩余--
    }

    const FAT = []
    for (const 扇 of 表) {
      const 块 = this.扇区(扇)
      for (let i = 0; i < 块.length / 4; i++) FAT.push(块.readUInt32LE(i * 4))
    }
    return FAT
  }

  /** 沿 FAT 链把扇区串起来 */
  读链 (起始) {
    const 块们 = []
    let 号 = 起始
    let 防死循环 = 0
    while (号 !== 链尾 && 号 !== 空闲 && 号 < this.FAT.length) {
      if (号 === FAT扇区 || 号 === DIFAT扇区) break
      块们.push(this.扇区(号))
      号 = this.FAT[号]
      if (++防死循环 > 1e6) break
    }
    return Buffer.concat(块们)
  }

  /** 目录项 = 文件里那些"流"的名字与位置 */
  读目录 () {
    const 原始 = this.读链(this.目录起始)
    const 条目们 = []
    for (let 起 = 0; 起 + 128 <= 原始.length; 起 += 128) {
      const 块 = 原始.subarray(起, 起 + 128)
      const 名字长 = 块.readUInt16LE(64)
      const 类型 = 块.readUInt8(66)
      if (类型 === 0) continue
      const 名字 = 名字长 > 2
        ? 块.subarray(0, Math.max(0, 名字长 - 2)).toString('utf16le')
        : ''
      条目们.push({
        名字,
        类型, // 1=目录 2=流 5=根
        起始扇区: 块.readUInt32LE(116),
        大小: 块.readUInt32LE(120)
      })
    }
    return 条目们
  }

  /** 迷你流 = 根条目的流;小于阈值的流都切成 64B 小扇区放在这里 */
  建迷你流 () {
    const 根 = this.条目.find(e => e.类型 === 5)
    if (!根) return Buffer.alloc(0)
    const 迷你FAT = this.读链(this.迷你FAT起始)
    this.迷你FAT表 = []
    for (let i = 0; i + 4 <= 迷你FAT.length; i += 4) this.迷你FAT表.push(迷你FAT.readUInt32LE(i))
    return this.读链(根.起始扇区)
  }

  /** 读一个迷你流的扇区链 */
  读迷你链 (起始) {
    const 块们 = []
    let 号 = 起始
    let 防 = 0
    while (号 !== 链尾 && 号 !== 空闲 && 号 < (this.迷你FAT表?.length || 0)) {
      const 起 = 号 * this.迷你扇区大小
      块们.push(this.迷你流.subarray(起, 起 + this.迷你扇区大小))
      号 = this.迷你FAT表[号]
      if (++防 > 1e6) break
    }
    return Buffer.concat(块们)
  }

  /** 按名字取一个流的内容 */
  流 (名字) {
    const 条目 = this.条目.find(e => e.类型 === 2 && e.名字 === 名字)
    if (!条目) return null
    const 原始 = 条目.大小 < this.迷你阈值 ? this.读迷你链(条目.起始扇区) : this.读链(条目.起始扇区)
    return 原始.subarray(0, 条目.大小)
  }

  /** 流名字清单(诊断用) */
  流名单 () {
    return this.条目.filter(e => e.类型 === 2).map(e => `${e.名字}(${e.大小}B)`)
  }
}
