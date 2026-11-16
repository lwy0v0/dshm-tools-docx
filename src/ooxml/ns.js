/**
 * 命名空间与元素名常量。
 *
 * 规矩:所有模块从这里取命名空间,**不许在别处写字符串字面量拼 URL** ——
 * Word 会把同一份文档在 Transitional / Strict 两套命名空间下写出来,
 * 改一处就能全改掉(见 `常见命名空间` 里 strict 那几行)。
 */

/** WordprocessingML 的命名空间(Transitional / Strict 两种写法) */
export const W = [
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main'
]

/** DrawingML(图片、形状、图表) */
export const A = [
  'http://schemas.openxmlformats.org/drawingml/2006/main',
  'http://purl.oclc.org/ooxml/drawingml/main'
]

/** WordprocessingDrawing(行内/浮动图片容器) */
export const WP = [
  'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  'http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing'
]

/** Picture(图片填充) */
export const PIC = ['http://schemas.openxmlformats.org/drawingml/2006/picture']

/** 公式 OMML */
export const M = [
  'http://schemas.openxmlformats.org/officeDocument/2006/math',
  'http://purl.oclc.org/ooxml/officeDocument/math'
]

/** 关系(rels) */
export const R = [
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  'http://purl.oclc.org/ooxml/officeDocument/relationships'
]

/** 包级关系 */
export const PKG_REL = ['http://schemas.openxmlformats.org/package/2006/relationships']

/** Word 2010 扩展(文本框、形状、墨迹) */
export const WPS = ['http://schemas.microsoft.com/office/word/2010/wordprocessingShape']
export const WPG = ['http://schemas.microsoft.com/office/word/2010/wordprocessingGroup']

/** VML(老式图片、水印、文本框) */
export const V = ['urn:schemas-microsoft-com:vml']
export const O = ['urn:schemas-microsoft-com:office:office']

/** 兼容内容分支(SVG/PNG 双份就在这里) */
export const MC = ['http://schemas.openxmlformats.org/markup-compatibility/2006']

/** 图表 */
export const C = ['http://schemas.openxmlformats.org/drawingml/2006/chart']

/** SmartArt 数据模型 */
export const DGM = ['http://schemas.openxmlformats.org/drawingml/2006/diagram']

/** 内容类型(包级) */
export const CT = ['http://schemas.openxmlformats.org/package/2006/content-types']

/** 关系类型:用后缀匹配,避免两套命名空间各写一遍 */
export const REL = {
  主文档: '/officeDocument',
  图片: '/image',
  超链接: '/hyperlink',
  页眉: '/header',
  页脚: '/footer',
  脚注: '/footnotes',
  尾注: '/endnotes',
  批注: '/comments',
  批注扩展: '/commentsExtended',
  编号: '/numbering',
  样式: '/styles',
  设置: '/settings',
  图表: '/chart',
  图表图形: '/diagramData',
  嵌入对象: '/oleObject',
  包嵌入: '/package',
  外部链接: '/externalLink',
  主题: '/theme',
  字体表: '/fontTable'
}

/**
 * 判断一个节点是否属于某命名空间集合。
 * @param {import('./xml.js').XmlNode} node
 * @param {string[]} uris
 */
export function inNs (node, uris) {
  return !!node && uris.includes(node.uri)
}
