/**
 * 内容控件 `w:sdt`:九种类型的识别 + 选项 + 勾选状态 + 数据绑定。
 *
 * 单独一个文件的原因:类型判断有十几条规则,塞进行内收集器会把那个文件撑成一锅粥。
 */

import { W } from '../ooxml/ns.js'

export class 内容控件 {
  /**
   * 解析一个 `w:sdt` 的描述。
   * @param {import('../ooxml/xml.js').XmlNode} 节点
   * @returns {{类型:string, 标签:string, 已勾选?:boolean, 可选项?:string[], 日期格式?:string, 库?:string, 数据绑定?:object}|null}
   */
  static 解析 (节点) {
    const pr = 节点.找('sdtPr', W)
    if (!pr) return null

    const 标签 = pr.找('alias', W)?.属性('val') || ''
    const 数据绑定 = 内容控件.读数据绑定(pr)
    const 公共 = { 标签, ...(数据绑定 ? { 数据绑定 } : {}) }

    // 复选框
    const 复选框 = pr.找('checkbox', W)
    if (复选框) {
      const 勾 = 复选框.找('checked', W)?.属性('val')
      return { 类型: '复选框', ...公共, 已勾选: 勾 === '1' || 勾 === 'true' }
    }

    // 下拉 / 组合框
    for (const [元素, 类型] of [['dropDownList', '下拉'], ['comboBox', '组合框']]) {
      const 列 = pr.找(元素, W)
      if (列) {
        const 可选项 = 列.找全部('listItem', W).map(i => i.属性('displayText') || i.属性('value')).filter(Boolean)
        return { 类型, ...公共, 可选项 }
      }
    }

    // 日期
    const 日期 = pr.找('date', W)
    if (日期) {
      const 格式 = 日期.找('dateFormat', W)?.属性('val') || 日期.属性('fullDate')
      return { 类型: '日期', ...公共, ...(格式 ? { 日期格式: 格式 } : {}) }
    }

    if (pr.有没有('picture', W)) return { 类型: '图片', ...公共 }
    if (pr.有没有('repeatingSection', W)) return { 类型: '重复节', ...公共 }
    if (pr.有没有('text', W)) return { 类型: '纯文本', ...公共 }

    // 文档部件库
    const 部件 = pr.找('docPartObj', W)
    if (部件) {
      const 库 = 部件.找('docPartGallery', W)?.属性('val') || ''
      return { 类型: '文档部件', ...公共, ...(库 ? { 库 } : {}) }
    }

    return { 类型: '富文本', ...公共 }
  }

  /** 值已在标记里说过的类型:正文不必再重复 */
  static 只标记 (控件) {
    return ['复选框', '下拉', '日期', '图片'].includes(控件?.类型)
  }

  /** 数据绑定:绑到 customXml 的哪个字段 */
  static 读数据绑定 (pr) {
    const 绑 = pr.找('dataBinding', W)
    if (!绑) return undefined
    const 结果 = {}
    if (绑.属性('xpath')) 结果.xpath = 绑.属性('xpath')
    if (绑.属性('storeItemID')) 结果.storeItemID = 绑.属性('storeItemID')
    if (绑.属性('prefixMappings')) 结果.prefixMappings = 绑.属性('prefixMappings')
    return Object.keys(结果).length ? 结果 : undefined
  }

  /** 控件的描述 → 块/片段(把可选字段摊平) */
  static 摊平 (控件, 值) {
    return {
      种类: '控件',
      控件类型: 控件.类型,
      标签: 控件.标签,
      值: 值 ?? '',
      ...(控件.已勾选 !== undefined ? { 已勾选: 控件.已勾选 } : {}),
      ...(控件.可选项 ? { 可选项: 控件.可选项 } : {}),
      ...(控件.日期格式 ? { 日期格式: 控件.日期格式 } : {}),
      ...(控件.库 ? { 库: 控件.库 } : {}),
      ...(控件.数据绑定 ? { 数据绑定: 控件.数据绑定 } : {})
    }
  }
}

export { W }
