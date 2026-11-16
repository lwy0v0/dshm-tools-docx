/**
 * 输出层出口:块对象 → Markdown。
 *
 * 拆成三个文件:行内格式、块结构、表格,各自改各自的。
 * 两条铁律:解析层不认识 Markdown;这里不碰 XML。
 */

export { 渲染块, 纯文本 } from './block.js'
export { 渲染片段 } from './inline.js'
export { 渲染表格, 渲染表格HTML } from './table.js'
