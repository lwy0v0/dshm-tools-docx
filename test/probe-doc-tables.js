/**
 * 探针 2:验证 `.doc` 里"格式/样式/表格"相关的结构是否真的能定位到。
 * 用法:node test/probe-doc-tables.js <doc>
 */

import { readFileSync } from 'node:fs'
import { CfbFile } from '../src/ooxml/cfb.js'

const 文件 = process.argv[2]
if (!文件) { console.error('用法:node test/probe-doc-tables.js <doc>'); process.exit(1) }

const cfb = new CfbFile(readFileSync(文件))
const 文档 = cfb.流('WordDocument')
const 标志 = 文档.readUInt16LE(10)
const 表名 = (标志 & 0x0200) ? '1Table' : '0Table'
const 表 = cfb.流(表名)
console.log(`表流 ${表名} 长度 ${表.length}`)

/** FibRgFcLcb97 里几个关键字段:名字 → FIB 内偏移 */
const 字段 = {
  '样式表 STSH': 0x00aa,
  '段落属性表 PlcfbtePapx': 0x0102,
  '字符属性表 PlcfbteChpx': 0x00fa,
  '节属性表 PlcfSed': 0x00ca,
  '表格属性表 PlcfTAPX(通过 PAPX)': null,
  '批注表 PlcfAtnBkf': 0x0176,
  '脚注表 PlcfFtn': 0x00c6,
  '图片结构 PlcfBteChpx 内的 fcPic': null
}

for (const [名, 偏移] of Object.entries(字段)) {
  if (偏移 === null) continue
  const fc = 文档.readUInt32LE(偏移)
  const lcb = 文档.readUInt32LE(偏移 + 4)
  const 合理 = fc + lcb <= 表.length && lcb > 0
  console.log(`  ${名.padEnd(28)} fc=${fc} lcb=${lcb} ${合理 ? '✓ 在表流内' : '✗ 越界/为空'}`)
}

// STSH:开头是 cbStshi(Word97 应为 18),后面接样式若干 STD
const fcStshf = 文档.readUInt32LE(0x00aa)
const lcbStshf = 文档.readUInt32LE(0x00ae)
if (lcbStshf > 0 && fcStshf + lcbStshf <= 表.length) {
  const stsh = 表.subarray(fcStshf, fcStshf + lcbStshf)
  const cbStshi = stsh.readUInt16LE(0)
  const cstd = stsh.readUInt16LE(2 + cbStshi)
  console.log(`\nSTSH: cbStshi=${cbStshi} 样式数 cstd=${cstd}`)
  // 扫前几个 STD 的名字(Word97 STD: cbStd 2B, 然后 flags, sti 2B, stk/istdBase, 名字长度 2B + 名字)
  let p = 2 + cbStshi + 2
  for (let i = 0; i < Math.min(cstd, 8) && p + 10 < stsh.length; i++) {
    const cbStd = stsh.readUInt16LE(p)
    if (!cbStd || p + cbStd > stsh.length) break
    const 记录 = stsh.subarray(p + 2, p + 2 + cbStd)
    const 名长 = 记录.readUInt16LE(2 + 2 + 1 + 1 + 2)
    const 名 = 名长 > 0 ? 记录.subarray(10, 10 + 名长 * 2).toString('utf16le') : '(无名字)'
    console.log(`  样式[${i}] cbStd=${cbStd} 名字=${JSON.stringify(名)}`)
    p += 2 + cbStd
  }
}
