/**
 * 行内收集器:把一个容器(`w:p`、`w:tc`、`w:hyperlink`、`w:sdtContent`…)里的
 * 文本与行内对象按**出现顺序**摊平成片段数组。
 *
 * 它只认 XML,不认识"输出成什么样":图片/公式/嵌入对象只交出**节点**,
 * 由块层去解析(这样才能做到"改图片逻辑只动 image.js")。
 */

import { W, M, WPS, MC } from '../../ooxml/ns.js'
import { 开关 } from '../styles.js'
import { 特殊文本 } from './special.js'
import { 内容控件 } from '../sdt.js'
import { 域收集器, 是页码类, 域类型 } from '../fields.js'
import { 行内格式 } from './format.js'
import { 运行解析器 } from './run.js'

/**
 * @typedef {object} 片段
 * @property {'文本'|'图片'|'绘图'|'公式'|'嵌入对象'|'脚注引用'|'批注标记'|'域'|'符号'|'文本框'|'不可得'} 种类
 */

export class 行内收集器 {
  /**
   * @param {import('../styles.js').StyleSheet} 样式表
   * @param {Record<string, {类型:string, 目标:string, 外部:boolean}>} 关系表
   */
  constructor (样式表, 关系表 = {}, 域清单 = null) {
    this.样式表 = 样式表
    this.关系表 = 关系表
    this.域清单 = 域清单
  }

  /**
   * 收集容器里的一切行内内容。
   * @param {import('../../ooxml/xml.js').XmlNode} 容器
   * @param {{粗体?:boolean, 斜体?:boolean}} [继承格式] 来自段落样式的默认格式
   * @returns {{片段: 片段[], 有修订: boolean, 批注ids: string[]}}
   */
  收集 (容器, 继承格式 = {}) {
    this.片段 = []
    this.域 = new 域收集器(this.域清单)
    this.格式器 = new 行内格式(this.样式表, () => this.域.在链接域中())
    this.运行 = new 运行解析器(this)
    this.有修订 = false
    this.批注ids = []
    this.遍历(容器, {
      链接: null,
      修订: null,
      控件: null,
      粗体: !!继承格式.粗体,
      斜体: !!继承格式.斜体,
      字号: 继承格式.字号 ?? null,
      颜色: 继承格式.颜色 ?? null,
      字体: 继承格式.字体 ?? null
    })
    this.收尾域()
    return { 片段: this.片段, 有修订: this.有修订, 批注ids: this.批注ids }
  }

  /** 推入一个片段(空白片段丢弃;页码域的结果文字直接丢掉) */
  推 (片段) {
    if (片段.种类 === '文本' && 片段.文本 === '') return
    if (片段.种类 === '文本' && this.域.在页码域中()) return
    this.片段.push(片段)
  }

  /** 容器级遍历:处理包装元素(修订、超链接、内容控件、透明容器) */
  遍历 (节点, 上下文) {
    for (const 子 of 节点.子) {
      const 名 = 子.名

      // 兼容内容(SVG + PNG 双份):取 Fallback
      if (名 === 'AlternateContent' && MC.includes(子.uri)) {
        const 支 = 子.找('Fallback', MC) || 子.找('Choice', MC)
        if (支) this.遍历(支, 上下文)
        continue
      }

      if (!W.includes(子.uri) && !M.includes(子.uri)) {
        // 非 Word 命名空间:绘图照收;公式(前缀没解析出来时 uri 为空)也认;
        // 其余容器继续往里找,别把内容静默丢掉
        if (子.名 === 'drawing' || 子.名 === 'pict') this.推({ 种类: '绘图', 节点: 子, ...上下文 })
        else if (子.名 === 'oMath' || 子.名 === 'oMathPara') this.推({ 种类: '公式', 节点: 子, 独立: 子.名 === 'oMathPara' })
        else if (子.子.length) this.遍历(子, 上下文)
        continue
      }
      switch (名) {
        case 'drawing':
        case 'pict':
          this.推({ 种类: '绘图', 节点: 子, ...上下文 })
          break
        case 'object':
          this.推({ 种类: '嵌入对象', 节点: 子, ...上下文 })
          break
        case 'r':
          this.读run(子, 上下文)
          break
        case 'hyperlink': {
          const 目标 = this.链接目标(子)
          this.遍历(子, { ...上下文, 链接: 目标 })
          break
        }
        case 'ins':
        case 'moveTo':
          this.有修订 = true
          this.遍历(子, { ...上下文, 修订: { 类型: '新增', 作者: 子.属性('author'), 时间: 子.属性('date') } })
          break
        case 'del':
        case 'moveFrom':
          this.有修订 = true
          this.遍历(子, { ...上下文, 修订: { 类型: '删除', 作者: 子.属性('author'), 时间: 子.属性('date') } })
          break
        case 'sdt': {
          const 内容 = 子.找('sdtContent', W)
          const 控件 = 内容控件.解析(子)
          if (控件) {
            this.推({
              种类: '控件',
              控件类型: 控件.类型,
              标签: 控件.标签,
              值: 内容 ? 内容.全部文本().trim() : '',
              已勾选: 控件.已勾选,
              可选项: 控件.可选项,
              日期格式: 控件.日期格式,
              库: 控件.库,
              数据绑定: 控件.数据绑定,
              锚: 子.锚路径()
            })
          }
          // 复选框/下拉/日期这类"值已经在标记里说过"的控件不再重复正文
          const 只标记 = ['复选框', '下拉', '日期', '图片'].includes(控件?.类型)
          if (内容 && !只标记) this.遍历(内容, { ...上下文, 控件 })
          break
        }
        case 'fldSimple':
          this.读简单域(子, 上下文)
          break
        case 'pPr':
        case 'rPr':
        case 'proofErr':
        case 'lastRenderedPageBreak':
          break
        case 'bookmarkStart':
          this.推({ 种类: '书签', 名: 子.属性('name') })
          break
        case 'commentRangeStart':
        case 'commentRangeEnd': {
          const id = 子.属性('id')
          this.批注ids.push(id)
          this.推({ 种类: '批注标记', id, 起: 名 === 'commentRangeStart' })
          break
        }
        case 'smartTag':
        case 'customXml':
        case 'dir':
        case 'bdo':
        case 'moveFromRangeStart':
        case 'moveToRangeStart':
        case 'moveFromRangeEnd':
        case 'moveToRangeEnd':
          this.遍历(子, 上下文)
          break
        case 'oMath':
          this.推({ 种类: '公式', 节点: 子, 独立: false })
          break
        case 'oMathPara':
          this.推({ 种类: '公式', 节点: 子, 独立: true })
          break
        default:
          // 未知容器:继续往里找,别吞内容
          if (子.子.length) this.遍历(子, 上下文)
          else if (子.文本()) this.推({ 种类: '文本', 文本: 子.文本(), ...基本格式(上下文) })
      }
    }
  }

  /** 单个 run */
  读run (run, 上下文) {
    this.运行.读(run, 上下文)
  }

  /** 读 run 的格式(规则在 format.js) */
  读格式 (rPr, 上下文) {
    return this.格式器.读(rPr, 上下文)
  }

  /** `w:hyperlink` 的目标 */
  链接目标 (hyper) {
    const rid = hyper.属性('id')
    if (rid && this.关系表[rid]) {
      const r = this.关系表[rid]
      return r.外部 ? r.目标 : `#${r.目标}`
    }
    const 锚点 = hyper.属性('anchor')
    return 锚点 ? `#${锚点}` : null
  }

  // —— 域:状态机在 fields.js,这里只接线 ——

  读域标记 (节点) {
    const 记录 = this.域.标记(节点)
    if (记录) this.输出域记录(记录)
  }

  读域指令 (节点) {
    this.域.指令(节点)
  }

  /** `w:fldSimple`:一条指令自带结果 */
  读简单域 (节点, 上下文) {
    const 记录 = this.域.简单域(节点)
    if (记录) this.输出域记录(记录)
    if (节点.子.length) this.遍历(节点, 上下文)
  }

  /** 页码类域:缓存值不可信,正文里标"不可得";其它域的结果文字已经在正文里,不重复输出 */
  输出域记录 (记录) {
    if (!记录) return
    if (!是页码类(记录.名称)) return
    this.推({
      种类: '不可得',
      原因: `页码(${记录.名称} 域)`,
      原值: 记录.结果,
      提示: '页码需要渲染才能确定,域里存的是上次排版值'
    })
  }

  /** 收尾:没闭合的域也要登记 */
  收尾域 () {
    for (const 记录 of this.域.收尾()) this.输出域记录(记录)
  }
}

function 基本格式 (上下文) {
  return { ...(上下文.链接 ? { 链接: 上下文.链接 } : {}), ...(上下文.修订 ? { 修订: 上下文.修订 } : {}) }
}

export { 内容控件, 域收集器, 是页码类, 域类型, WPS }