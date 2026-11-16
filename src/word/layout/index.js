/**
 * 版式模块的统一出口。
 *
 * 拆成四个文件的原因:段落版式、字符版式、表格尺寸、边框底纹是四件不同的事,
 * 改一处不该让另外三处的文件跟着变长。
 */

export { 边框, 底纹 } from './border.js'
export { 段落版式 } from './paragraph.js'
export { 字符版式, 开关 } from './character.js'
export { 表格尺寸, 行尺寸, 格尺寸 } from './table.js'
