/** 冒烟测试:ZIP + XML 底层能不能把夹具拆开 */

import { 造夹具 } from './fixtures.js'
import { 打开Zip } from '../src/ooxml/zip.js'
import { 解析Xml } from '../src/ooxml/xml.js'
import { W } from '../src/ooxml/ns.js'

const 字节 = 造夹具()
console.log('夹具大小:', 字节.length, 'bytes')

const 包 = 打开Zip(字节)
console.log('包内条目:', 包.列出())

const 文档xml = 包.取文本('word/document.xml')
console.log('document.xml 长度:', 文档xml.length)

const 根 = 解析Xml(文档xml)
console.log('根元素:', 根.前缀 + ':' + 根.名, '| uri =', 根.uri)

const body = 根.找('body', W)
console.log('body 子元素数:', body.子.length)
console.log('前 6 个子元素:', body.子.slice(0, 6).map(n => n.前缀 + ':' + n.名).join(', '))

// 找表格、公式、图片
const tbl = body.找('tbl', W)
console.log('表格行数:', tbl.找全部('tr', W).length)

const 公式 = []
收(body, 公式)
function 收 (n, 出) {
  for (const c of n.子) {
    if (c.名 === 'oMath' || c.名 === 'oMathPara') 出.push(c.路径())
    收(c, 出)
  }
}
console.log('公式节点:', 公式.length)

// 样式与编号
const 样式 = 解析Xml(包.取文本('word/styles.xml'))
console.log('样式数:', 样式.找全部('style', undefined).length)
const 编号 = 解析Xml(包.取文本('word/numbering.xml'))
console.log('abstractNum 数:', 编号.找全部('abstractNum').length)

// 实体与 CDATA 往返
const t = 解析Xml('<r xmlns:x="u"><x:a v="1 &amp; 2">A&amp;B&#65;<![CDATA[<raw>]]></x:a></r>')
const a = t.找('a', ['u'])
console.log('属性解码:', a.属性('v'), '| 文本:', a.文本())
