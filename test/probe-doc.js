/**
 * 探针:验证 `.doc`(Word 97-2003 二进制)能读到什么 —— 只做事实采集,不产出产物。
 * 用法:node test/probe-doc.js <doc>
 */

import { readFileSync } from 'node:fs'
import { CfbFile } from '../src/ooxml/cfb.js'

const 文件 = process.argv[2]
if (!文件) { console.error('用法:node test/probe-doc.js <doc>'); process.exit(1) }

const cfb = new CfbFile(readFileSync(文件))
console.log('流清单:', cfb.流名单().join(' | '))

const 文档 = cfb.流('WordDocument')
if (!文档) { console.error('没有 WordDocument 流'); process.exit(1) }

const nFib = 文档.readUInt16LE(2)
const 标志 = 文档.readUInt16LE(10)
const fComplex = (标志 & 0x0004) !== 0
const fEncrypted = (标志 & 0x0100) !== 0
const fWhichTblStm = (标志 & 0x0200) !== 0
const fcMin = 文档.readUInt32LE(0x18)
const fcMac = 文档.readUInt32LE(0x1c)
const ccpText = 文档.readUInt32LE(0x4c)
const fcClx = 文档.readUInt32LE(0x01a2)
const lcbClx = 文档.readUInt32LE(0x01a6)

console.log(`\nFIB: nFib=${nFib}(${版本名(nFib)}) fComplex=${fComplex} fEncrypted=${fEncrypted} 表流=${fWhichTblStm ? '1Table' : '0Table'}`)
console.log(`     fcMin=${fcMin} fcMac=${fcMac} ccpText=${ccpText}字节/字符 | CLX @${fcClx} 长 ${lcbClx}`)
console.log(`     其他计数: 脚注 ${文档.readUInt32LE(0x50)} 页眉 ${文档.readUInt32LE(0x54)} 批注 ${文档.readUInt32LE(0x58)} 尾注 ${文档.readUInt32LE(0x5c)}`)

const 表 = cfb.流(fWhichTblStm ? '1Table' : '0Table')
const clx = 表.subarray(fcClx, fcClx + lcbClx)
const 文本 = 取文本(文档, clx, ccpText)

console.log(`\n正文长度: ${文本.length} 字符`)
const 特殊 = {}
for (const ch of 文本) {
  const c = ch.codePointAt(0)
  if (c < 0x20 && c !== 0x09) 特殊[c.toString(16).padStart(2, '0')] = (特殊[c.toString(16).padStart(2, '0')] || 0) + 1
}
console.log('控制字符分布:', JSON.stringify(特殊))

const 段 = 文本.split('\r').map(s => s.replace(/\x07/g, ' | ').replace(/[\x13\x14\x15]/g, '').replace(/\x0b/g, '⏎').trim()).filter(Boolean)
console.log(`段落数(按 \r 切): ${段.length}`)
console.log('\n前 8 段:')
段.slice(0, 8).forEach((s, i) => console.log(`  ${i + 1}. ${s.slice(0, 90)}`))

function 版本名 (n) {
  if (n >= 0x00D9) return 'Word 2003+'
  if (n >= 0x00C1) return 'Word 97/2000/2002'
  if (n >= 0x0065) return 'Word 6/95'
  return '未知'
}

/** 用 CLX 里的分片表(piece table)取文本 */
function 取文本 (文档, clx, ccpText) {
  // 跳过 Prc 前缀,找到 Pcdt(0x02)
  let i = 0
  while (i < clx.length && clx[i] === 0x01) {
    const cb = clx.readUInt16LE(i + 1)
    i += 3 + cb
  }
  if (clx[i] !== 0x02) return '〔无分片表〕'
  const lcb = clx.readUInt32LE(i + 1)
  const plc = clx.subarray(i + 5, i + 5 + lcb)
  const n = Math.floor((plc.length - 4) / 12)

  let 出 = ''
  for (let k = 0; k < n; k++) {
    const cp起 = plc.readUInt32LE(k * 4)
    const cp终 = plc.readUInt32LE((k + 1) * 4)
    const 个数 = cp终 - cp起
    if (cp起 >= ccpText) break
    const 有效 = Math.min(个数, ccpText - cp起)

    const pcd = 4 * (n + 1) + k * 8
    const fc原始 = plc.readUInt32LE(pcd + 2)
    const 压缩 = (fc原始 & 0x40000000) !== 0
    const fc = fc原始 & 0x3FFFFFFF
    if (压缩) {
      const 起 = fc / 2
      出 += 文档.subarray(起, 起 + 有效).toString('latin1')
    } else {
      出 += 文档.subarray(fc, fc + 有效 * 2).toString('utf16le')
    }
  }
  return 出
}
