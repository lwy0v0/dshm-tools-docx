/**
 * `w:altChunk`:整块嵌进来的 HTML / RTF 片段。
 *
 * 这类内容不在主文档里(是独立部件),所以只能"读成文字",回写时原样回填。
 */

export class AltChunk {
  /**
   * @param {import('../../ooxml/xml.js').XmlNode} 节点 `w:altChunk`
   * @param {import('../context.js').WordContext} 上下文
   * @returns {object} 块
   */
  static 解析 (节点, 上下文) {
    const rid = 节点.属性('id')
    const 关系 = rid ? 上下文.关系目标(rid) : null
    if (!关系) {
      上下文.记不可得('altChunk 外部片段', '引用缺失')
      return { 类型: '不可得', 原因: 'altChunk 引用缺失' }
    }

    const 类型 = 上下文.包.部件类型(关系.目标) || ''
    const 文本 = 上下文.包.文本(关系.目标) || ''

    if (/html/i.test(类型)) {
      return { 类型: '段落', 片段: [{ 种类: '文本', 文本: AltChunk.去标签(文本) }], 样式名: 'altChunk(HTML)' }
    }
    if (/rtf/i.test(类型)) {
      return { 类型: '段落', 片段: [{ 种类: '文本', 文本: 文本.slice(0, 4000) }], 样式名: 'altChunk(RTF 原文)' }
    }
    return { 类型: '不可得', 原因: `altChunk 类型不支持(${类型})` }
  }

  /** 粗暴去 HTML 标签(altChunk 只求拿到文字) */
  static 去标签 (html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/[ \t]+/g, ' ')
      .trim()
  }
}
