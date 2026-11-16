/**
 * Word 层的转换上下文:把"包、样式、编号、公式、媒体、统计"打成一个包,
 * 传给每个块解析器。
 *
 * 规矩:块解析器只能从这里拿服务,不许自己去打开文件/拼路径 ——
 * 这样换存储位置、换导出策略都只改一处。
 */

import { W } from '../ooxml/ns.js'
import { StyleSheet } from './styles.js'
import { 编号规则 } from './numbering.js'
import { 公式转换 } from '../math/omml.js'
import { 行内收集器 } from './inline/runs.js'

export class WordContext {
  /**
   * @param {object} 参数
   * @param {import('../ooxml/package.js').OoxmlPackage} 参数.包
   * @param {string} 参数.主文档 主文档部件路径
   * @param {{导出图片:boolean}} 参数.选项
   * @param {{取: (部件路径:string) => ({相对路径:string, 字节长度:number, 类型:string}|null)}} 参数.媒体
   */
  constructor ({ 包, 主文档, 选项, 媒体 }) {
    this.包 = 包
    this.主文档 = 主文档
    this.当前部件 = 主文档
    this.选项 = 选项
    this.媒体 = 媒体

    this.关系表 = {} // 当前部件的 rels(遍历时切换)
    this.样式 = new StyleSheet(包.xml(包.按类型找('/styles', 主文档)))
    this.编号 = new 编号规则(包.xml(包.按类型找('/numbering', 主文档)))
    this.公式 = new 公式转换()

    this.统计 = { 段落: 0, 标题: 0, 表格: 0, 表格行: 0, 图片: 0, 公式: 0, 批注: 0, 脚注: 0, 修订: 0, 控件: 0, 分节: 0, 域: 0 }
    this.不可得 = []
    this.资源 = { 图片: [], 表格: [], 公式: [], 图表: [], 智能图形: [], 批注: [], 脚注: [], 书签: [], 域: [] }
    /** 域清单:回写要用(指令 + 结果 + 是否需要重算 + 锚) */
    this.域清单 = this.资源.域

    this._脚注缓存 = null
    this._尾注缓存 = null
    this._批注缓存 = null
    this._页眉页脚缓存 = new Map()

    /** 引用到的脚注/尾注: `脚注:1` → { 标号, 注型 } */
    this.引用脚注 = new Map()
    this.脚注序号 = 0
    /** 引用到的批注 id(按出现顺序) */
    this.引用批注 = []

    /** 由 document.js 注入:把一段 XML 当独立正文解析(文本框/单元格里用) */
    this.解析块 = null
  }

  /** 正文里遇到脚注/尾注引用 */
  登记脚注 (id, 注型) {
    const 键 = `${注型}:${id}`
    const 已有 = this.引用脚注.get(键)
    if (已有) return 已有.标号
    const 标号 = ++this.脚注序号
    this.引用脚注.set(键, { 标号, 注型, id })
    this.统计.脚注++
    return 标号
  }

  /** 正文里遇到批注标记 */
  记批注引用 (id) {
    if (!this.引用批注.includes(id)) this.引用批注.push(id)
  }

  /** 切换当前部件(遍历页眉页脚时会用) */
  用部件 (部件路径) {
    this.当前部件 = 部件路径
    this.关系表 = this.包.关系(部件路径)
  }

  /** 块的锚点:回写时用它把块对回原始 XML */
  锚 (节点) {
    return { 部件: this.当前部件, 路径: 节点.锚路径() }
  }

  /** 导出媒体:返回相对产物根的路径;导出关闭时返回 null */
  导出媒体 (部件路径) {
    if (!this.选项.导出图片) return null
    return this.媒体.取(部件路径)
  }

  /** 登记一张被正文引用的图片(统计与清单用) */
  登记图片 (信息, { 宽 = null, 高 = null, 替代文字 = '', 浮动 = false } = {}) {
    if (!信息) return
    if (this.资源.图片.some(x => x.相对路径 === 信息.相对路径)) return
    this.资源.图片.push({ ...信息, 宽, 高, 替代文字, 浮动 })
  }

  /** 记一条不可得 */
  记不可得 (原因, 提示 = '', 原值 = '') {
    this.不可得.push({ 原因, 提示, 原值 })
  }

  /** 脚注表: id → { 内容块, 作者, 类型 } */
  脚注表 (注型 = '脚注') {
    const 键 = 注型 === '脚注' ? '_脚注缓存' : '_尾注缓存'
    if (this[键]) return this[键]
    const 后缀 = 注型 === '脚注' ? '/footnotes' : '/endnotes'
    const 部件 = this.包.按类型找(后缀, this.主文档)
    const 表 = new Map()
    const 根 = 部件 ? this.包.xml(部件) : null
    if (根) {
      const 元素名 = 注型 === '脚注' ? 'footnote' : 'endnote'
      for (const 注 of 根.找全部(元素名, W)) {
        const id = 注.属性('id')
        const 类型 = 注.属性('type') || 'normal'
        表.set(id, { 类型, 节点: 注, 部件 })
      }
    }
    this[键] = 表
    return 表
  }

  /** 批注表: id → { 作者, 首字母, 时间, 节点 } */
  批注表 () {
    if (this._批注缓存) return this._批注缓存
    const 部件 = this.包.按类型找('/comments', this.主文档)
    const 表 = new Map()
    const 根 = 部件 ? this.包.xml(部件) : null
    if (根) {
      for (const c of 根.找全部('comment', W)) {
        表.set(c.属性('id'), {
          作者: c.属性('author') || '',
          首字母: c.属性('initials') || '',
          时间: c.属性('date') || '',
          节点: c
        })
      }
    }
    this._批注缓存 = 表
    return 表
  }

  /** 新建行内收集器(用当前部件的关系表) */
  新收集器 () {
    return new 行内收集器(this.样式, this.关系表, this.域清单)
  }

  /** 关系目标(原始路径转包内路径已在 package 里做过) */
  关系目标 (rid) {
    return this.关系表[rid] || null
  }
}
