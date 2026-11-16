/**
 * 探针 3:验证 `.doc` 的"格式信息"(FKP 页:字符属性 CHPX / 段落属性 PAPX)能否解出来。
 * 这是判断"能不能恢复加粗/字号/对齐/标题层级"的关键。
 * 用法:node test/probe-doc-fkp.js <doc>
 */

import { readFileSync } from 'node:fs'
import { CfbFile } from '../src/ooxml/cfb.js'

const 文件 = process.argv[2]
if (!文件) { console.error('用法:node test/probe-doc-fkp.js <doc>'); process.exit(1) }

const cfb = new CfbFile(readFileSync(文件))
const 文档 = cfb.流('WordDocument')
const 表 = cfb.流((文档.readUInt16LE(10) & 0x0200) ? '1Table' : '0Table')

console.log('—— CHPX(字符属性)——')
const chpx页 = 读FKP页(文档, 表, 0x00fa)
console.log(`  PlcfbteChpx 指向 ${chpx页.length} 个 FKP 页`)
let 总run = 0
for (const 页 of chpx页.slice(0, 3)) {
  const r = 解FKP(文档, 页)
  总run += r.run数
  console.log(`  页${页}: run ${r.run数} 个;首 run 属性 = ${JSON.stringify(r.首run属性)}`)
}
console.log(`  前 3 页共 ${总run} 个 run`)

console.log('\n—— PAPX(段落属性)——')
const papx页 = 读FKP页(文档, 表, 0x0102)
console.log(`  PlcfbtePapx 指向 ${papx页.length} 个 FKP 页`)
for (const 页 of papx页.slice(0, 2)) {
  const r = 解PAPX(文档, 页)
  console.log(`  页${页}: 段落 ${r.段数} 个;首段 istd(样式号)=${r.首段样式号} 属性=${JSON.stringify(r.首段属性)}`)
}

// —————————— 实现 ——————————

/** 从 Plcfbte 里取出 FKP 页号列表 */
function 读FKP页 (文档, 表, 偏移) {
  const fc = 文档.readUInt32LE(偏移)
  const lcb = 文档.readUInt32LE(偏移 + 4)
  if (!lcb) return []
  const plc = 表.subarray(fc, fc + lcb)
  const n = Math.floor((plc.length - 4) / 8) // (n+1)*4 + n*4
  const 页们 = []
  for (let i = 0; i < n; i++) 页们.push(plc.readUInt32LE((n + 1) * 4 + i * 4))
  return 页们
}

/** 解一个 CHPX FKP 页 */
function 解FKP (文档, 页号) {
  const 起 = 页号 * 512
  const 页 = 文档.subarray(起, 起 + 512)
  const crun = 页[511]
  // (crun+1) 个 FC
  const run数 = crun
  let 首run属性 = null
  if (crun > 0) {
    const 偏移 = 页[crun * 4 + (0)] // rgb[0]
    if (偏移) {
      const p = 偏移 * 2
      const cb = 页[p]
      const grpprl = 页.subarray(p + 1, p + 1 + cb)
      首run属性 = 解grpprl(grpprl)
    }
  }
  return { run数, 首run属性 }
}

/** 解一个 PAPX FKP 页 */
function 解PAPX (文档, 页号) {
  const 起 = 页号 * 512
  const 页 = 文档.subarray(起, 起 + 512)
  const crun = 页[511]
  let 首段样式号 = null
  let 首段属性 = null
  if (crun > 0) {
    const bx = 13 * crun // rgbx 从 4*(crun+1) 开始,每项 13 字节
    const bxOff = 4 * (crun + 1) + 0 // 第一项的 bOffset
    const 值 = 页.readUInt16LE(bx + bxOff)
    const p = 值 * 2
    const 字数 = 页[p]
    const 头 = p + 1 + (字数 ? 字数 * 2 : 1) // 有 word count 就跳过,否则 1 字节 istd
    首段样式号 = 页[p + 1]
    const 长 = 页[头]
    const grpprl = 页.subarray(头 + 1, 头 + 1 + 长)
    首段属性 = 解grpprl(grpprl)
  }
  return { 段数: crun, 首段样式号, 首段属性 }
}

/** 只解几个最常见的 sprm(够证明可行性) */
function 解grpprl (g) {
  const 出 = {}
  let i = 0
  while (i + 2 <= g.length) {
    const sprm = g.readUInt16LE(i)
    i += 2
    const sgc = (sprm >> 10) & 0x7
    const spra = (sprm >> 13) & 0x7
    // 操作数长度由 spra 决定
    let 长 = 0
    if (spra === 0 || spra === 1) 长 = 1
    else if (spra === 2 || spra === 4 || spra === 5) 长 = 2
    else if (spra === 3) 长 = 4
    else if (spra === 6) { 长 = g[i] ?? 0; i += 1 }
    else if (spra === 7) 长 = 3
    const 值 = g.subarray(i, i + 长)
    i += 长
    // 0x0835 sprmCFBold, 0x4A43 sprmCHps(半磅), 0x2403 sprmCJc(段落对齐)
    if (sprm === 0x0835) 出.粗体 = 值[0] === 1
    else if (sprm === 0x4A43) 出.字号 = (值.readUInt16LE(0) / 2) + 'pt'
    else if (sprm === 0x2403) 出.对齐 = 值[0]
    else if (sprm === 0x260A) 出.样式号 = 值.readUInt16LE(0)
  }
  return 出
}
