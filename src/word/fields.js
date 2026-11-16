/**
 * 域(OMML 之外的 `w:fldChar` 序列 / `w:fldSimple`)。
 *
 * 一个类管三件事,因为它们共享同一份状态:
 * 1. **状态机**:begin → 指令(instrText)→ separate → 结果 → end(允许嵌套);
 * 2. **分类**:页码 / 目录 / 引用 / 题注编号 / 超链接 / 日期 / 合并域 / 内嵌 / 其它;
 * 3. **清单**:每条域都记进 `资源.域`(带锚与"需重算"标记),回写时按它对位。
 *
 * 输出层的规矩:页码类在正文里标 `〔不可得:页码〕`(缓存值不可信);其它域的结果文字照留。
 */

import { W } from '../ooxml/ns.js'

/** 页码类域:结果是上次排版算出来的,不可信 */
const 页码类 = ['PAGE', 'NUMPAGES', 'SECTIONPAGES', 'PAGEREF']

const 类型表 = {
  PAGE: '页码',
  NUMPAGES: '页码',
  SECTIONPAGES: '页码',
  PAGEREF: '页码',
  TOC: '目录',
  REF: '引用',
  NOTEREF: '引用',
  SEQ: '题注编号',
  HYPERLINK: '超链接',
  DATE: '日期',
  TIME: '日期',
  CREATEDATE: '日期',
  SAVEDATE: '日期',
  PRINTDATE: '日期',
  MERGEFIELD: '合并域',
  IF: '合并域',
  NEXT: '合并域',
  INCLUDETEXT: '内嵌文件',
  INCLUDEPICTURE: '内嵌文件',
  EQ: '老式公式',
  STYLEREF: '样式引用',
  DOCPROPERTY: '文档属性'
}

/** 域类型(给编辑/渲染分类用) */
export function 域类型 (名) {
  return 类型表[名] || '其它'
}

/** 这个域的结果文字能不能信 */
export function 是页码类 (名) {
  return 页码类.includes(名)
}

export class 域收集器 {
  /**
   * @param {object[]|null} 清单 挂到上下文的 `资源.域`(可为空)
   */
  constructor (清单 = null) {
    this.清单 = 清单
    /** @type {{指令:string, 结果:string, 阶段:string, 锚:string|null, 脏:boolean}[]} */
    this.栈 = []
  }

  /** 处理一个 `w:fldChar`;闭合时返回这条域的记录 */
  标记 (节点) {
    const 类型 = 节点.属性('fldCharType')

    if (类型 === 'begin') {
      this.栈.push({
        指令: '',
        结果: '',
        阶段: '指令',
        锚: 节点.锚路径(),
        脏: (节点.属性('dirty') || '0') === '1' || 节点.属性('dirty') === 'true'
      })
      return null
    }

    if (类型 === 'separate') {
      const 顶 = this.栈[this.栈.length - 1]
      if (顶) {
        顶.阶段 = '结果'
        顶.名称 = (顶.指令.trim().split(/\s+/)[0] || '').toUpperCase()
        顶.页码域 = 是页码类(顶.名称)
        if (顶.名称 === 'HYPERLINK') 顶.链接目标 = 域收集器.读链接(顶.指令)
      }
      return null
    }

    if (类型 === 'end') {
      const 顶 = this.栈.pop()
      return 顶 ? this.登记(顶) : null
    }
    return null
  }

  /** 收集指令文字 */
  指令 (节点) {
    const 顶 = this.栈[this.栈.length - 1]
    if (顶 && 顶.阶段 === '指令') 顶.指令 += 节点.全部文本()
  }

  /** `w:fldSimple`:一条指令自带结果 */
  简单域 (节点) {
    return this.登记({
      指令: (节点.属性('instr') || '').trim(),
      结果: 节点.全部文本(),
      锚: 节点.锚路径(),
      脏: (节点.属性('dirty') || '0') === '1'
    })
  }

  /** 当前是否处在页码类域的结果里(那种文字不能当正文) */
  在页码域中 () {
    return this.栈.some(域 => 域.页码域 && 域.阶段 === '结果')
  }

  /** 当前是否处在 HYPERLINK 域的结果里;是则返回目标 */
  在链接域中 () {
    const 域 = [...this.栈].reverse().find(x => x.链接目标 && x.阶段 === '结果')
    return 域 ? 域.链接目标 : null
  }

  /** 收尾:把没闭合的域也登记掉 */
  收尾 () {
    const 出 = []
    while (this.栈.length) {
      const 顶 = this.栈.pop()
      const 记录 = this.登记(顶)
      if (记录) 出.push(记录)
    }
    return 出
  }

  /** 把一条域做成记录(并写进清单) */
  登记 (域) {
    const 指令 = (域.指令 || '').trim()
    const 名 = (指令.split(/\s+/)[0] || '').toUpperCase()
    if (!名) return null

    const 记录 = {
      指令,
      名称: 名,
      类型: 域类型(名),
      结果: (域.结果 || '').trim(),
      需重算: !!域.脏
    }
    if (名 === 'HYPERLINK') 记录.目标 = 域收集器.读链接(指令)
    if (['REF', 'NOTEREF', 'PAGEREF'].includes(名)) {
      const m = /(?:REF|NOTEREF|PAGEREF)\s+(\S+)/i.exec(指令)
      记录.书签 = m ? m[1] : null
    }
    if (域.锚) 记录.锚 = 域.锚

    this.清单?.push?.(记录)
    return 记录
  }

  /** 从 HYPERLINK 指令里取 URL */
  static 读链接 (指令) {
    const m = /HYPERLINK\s+"([^"]+)"/i.exec(指令) || /HYPERLINK\s+(\S+)/i.exec(指令)
    return m ? m[1] : null
  }
}

export { W }
