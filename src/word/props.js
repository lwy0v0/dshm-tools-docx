/**
 * 文档属性:`docProps/core.xml`、`app.xml`、`custom.xml`。
 *
 * 这部分是最便宜的上下文(几百字节),但往往直接回答"这是什么文档、谁写的、多少字"。
 */

import { 解析Xml } from '../ooxml/xml.js'

const 核心映射 = [
  ['title', '标题'],
  ['subject', '主题'],
  ['creator', '作者'],
  ['lastModifiedBy', '最后修改者'],
  ['revision', '修订次数'],
  ['created', '创建时间'],
  ['modified', '修改时间'],
  ['lastPrinted', '最后打印时间'],
  ['keywords', '关键词'],
  ['category', '分类'],
  ['description', '备注'],
  ['language', '语言']
]

const 应用映射 = [
  ['Pages', '页数', true],
  ['Words', '字数'],
  ['Characters', '字符数'],
  ['Paragraphs', '段落数'],
  ['Lines', '行数'],
  ['Company', '公司'],
  ['Application', '生成程序'],
  ['AppVersion', '程序版本'],
  ['Template', '模板']
]

/**
 * @param {import('../ooxml/package.js').OoxmlPackage} 包
 * @returns {Record<string, string>}
 */
export function 读文档属性 (包) {
  const 属性 = {}

  const 核心 = 包.文本('docProps/core.xml')
  if (核心) {
    const 根 = 解析Xml(核心)
    for (const [标签, 名] of 核心映射) {
      const 节点 = 找元素(根, 标签)
      if (节点) {
        const 值 = 节点.全部文本().trim()
        if (值) 属性[名] = 值
      }
    }
  }

  const 应用 = 包.文本('docProps/app.xml')
  if (应用) {
    const 根 = 解析Xml(应用)
    for (const [标签, 名] of 应用映射) {
      const 节点 = 找元素(根, 标签)
      if (节点) {
        const 值 = 节点.全部文本().trim()
        if (值) 属性[名] = 值
      }
    }
  }

  const 自定义 = 包.文本('docProps/custom.xml')
  if (自定义) {
    const 根 = 解析Xml(自定义)
    for (const p of 找全部(根, 'property')) {
      const 名 = p.属性('name')
      const 值 = p.全部文本().trim()
      if (名 && 值) 属性[名] = 值
    }
  }

  return 属性
}

/** 按本地名找第一个元素(命名空间都认) */
function 找元素 (根, 本地名) {
  return 找全部(根, 本地名)[0] || null
}

function 找全部 (根, 本地名) {
  const 出 = []
  const 走 = (节点) => {
    for (const c of 节点.子) {
      if (c.名 === 本地名) 出.push(c)
      else 走(c)
    }
  }
  走(根)
  return 出
}
