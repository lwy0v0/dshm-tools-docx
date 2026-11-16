/**
 * 用"英寸/毫米"报出页面尺寸,并估算页数(判断"是不是一张大纸")。
 * 用法:node test/page-size.js <docx> [docx2 …]
 */

import { OoxmlPackage } from '../src/ooxml/package.js'

for (const 文件 of process.argv.slice(2)) {
  const 包 = OoxmlPackage.打开文件(文件)
  const t = 包.文本(包.主文档路径())
  const 取 = (re, s = t) => Number((s.match(re) || [])[1] || 0)

  const 瓦 = t.match(/<w:pgSz[^>]*>/)?.[0] || ''
  const w = 取(/w:w="(\d+)"/, 瓦)
  const h = 取(/w:h="(\d+)"/, 瓦)
  const 边 = t.match(/<w:pgMar[^>]*>/)?.[0] || ''
  const 上 = 取(/w:top="(-?\d+)"/, 边)
  const 下 = 取(/w:bottom="(-?\d+)"/, 边)
  const 左 = 取(/w:left="(-?\d+)"/, 边)
  const 右 = 取(/w:right="(-?\d+)"/, 边)

  const 字 = (t.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) || []).join('').replace(/<[^>]+>/g, '').length
  const 正文宽 = (w - 左 - 右) / 1440 // 英寸
  const 正文高 = (h - 上 - 下) / 1440
  const 每行字 = Math.floor(正文宽 / (12 / 72))            // 按 12pt 汉字宽≈字号
  const 每页行 = Math.floor(正文高 / (12 * 1.5 / 72))       // 1.5 倍行距
  const 估页 = Math.ceil(字 / (每行字 * 每页行))

  console.log(文件.split(/[\\/]/).pop())
  console.log(`  纸张  ${(w / 1440).toFixed(2)} × ${(h / 1440).toFixed(2)} 英寸  =  ${Math.round(w / 1440 * 25.4)} × ${Math.round(h / 1440 * 25.4)} mm`)
  console.log(`  页边距 上${(上 / 1440 * 25.4).toFixed(0)} 下${(下 / 1440 * 25.4).toFixed(0)} 左${(左 / 1440 * 25.4).toFixed(0)} 右${(右 / 1440 * 25.4).toFixed(0)} mm`)
  console.log(`  正文区 ${正文宽.toFixed(2)} × ${正文高.toFixed(2)} 英寸 | 每行约 ${每行字} 字,每页约 ${每页行} 行`)
  console.log(`  文字   ${字} 字  →  估 ${估页} 页(12pt / 1.5 倍行距)`)
  console.log('')
}
