/**
 * 编号推算:把 `w:numPr` 变成"1."、"a)"、"•" 这样的真实标签。
 *
 * 要点:`numbering.xml` 里定义和实例是分开的(`abstractNum` 管格式,`num` 管引用与覆盖),
 * 而且计数是按"每个列表实例 + 层级"独立的,高级别递增时低级别要归零。
 */

import { W } from '../ooxml/ns.js'

/** 罗马数字 */
function 罗马 (n) {
  if (n <= 0) return String(n)
  const 表 = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let s = ''
  let 余 = n
  for (const [值, 符号] of 表) while (余 >= 值) { s += 符号; 余 -= 值 }
  return s
}

function 字母 (n) {
  if (n <= 0) return String(n)
  let s = ''
  let 余 = n
  while (余 > 0) {
    const r = (余 - 1) % 26
    s = String.fromCharCode(97 + r) + s
    余 = Math.floor((余 - 1) / 26)
  }
  return s
}

const 中文数字 = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

function 中文 (n) {
  if (n <= 10) return 中文数字[n] || String(n)
  if (n < 20) return '十' + (中文数字[n - 10] || '')
  if (n < 100) {
    const 十 = Math.floor(n / 10)
    const 个 = n % 10
    return 中文数字[十] + '十' + (个 ? 中文数字[个] : '')
  }
  return String(n)
}

/** numFmt → 序号文本 */
export function 格式化序号 (格式, 值) {
  switch (格式) {
    case 'decimal':
    case 'decimalZero':
      return 格式 === 'decimalZero' && 值 < 10 ? '0' + 值 : String(值)
    case 'lowerLetter': return 字母(值)
    case 'upperLetter': return 字母(值).toUpperCase()
    case 'lowerRoman': return 罗马(值).toLowerCase()
    case 'upperRoman': return 罗马(值)
    case 'chineseCounting':
    case 'chineseCountingThousand':
    case 'chineseLegalSimplified': return 中文(值)
    case 'ideographTraditional': return 中文(值)
    case 'decimalEnclosedCircle': return String.fromCodePoint(0x2460 + 值 - 1 > 0 && 值 <= 20 ? 0x2460 + 值 - 1 : 0x003f) || String(值)
    case 'none': return ''
    case 'bullet': return '•'
    default: return String(值)
  }
}

export class 编号规则 {
  /**
   * @param {import('../ooxml/xml.js').XmlNode|null} 根 numbering.xml 的根
   */
  constructor (根) {
    /** @type {Map<string, Map<string, any>>} abstractNumId → ilvl → {起始, 格式, 文本, 法律} */
    this.抽象表 = new Map()
    /** @type {Map<string, {抽象:string, 覆盖: Map<string, number|null>}>} */
    this.实例表 = new Map()
    /** 计数: `${numId}|${ilvl}` → 当前值 */
    this.计数 = new Map()

    if (!根) return
    for (const a of 根.找全部('abstractNum', W)) {
      const id = a.属性('abstractNumId')
      const 层 = new Map()
      for (const lvl of a.找全部('lvl', W)) {
        const ilvl = String(lvl.属性('ilvl') ?? '0')
        层.set(ilvl, {
          起始: Number(lvl.找('start', W)?.属性('val') ?? 1) || 1,
          格式: lvl.找('numFmt', W)?.属性('val') || 'decimal',
          文本: lvl.找('lvlText', W)?.属性('val') || '',
          合法: lvl.有没有('isLgl', W)
        })
      }
      this.抽象表.set(id, 层)
    }
    for (const n of 根.找全部('num', W)) {
      const numId = n.属性('numId')
      const 抽象 = n.找('abstractNumId', W)?.属性('val') || ''
      const 覆盖 = new Map()
      for (const o of n.找全部('lvlOverride', W)) {
        const ilvl = String(o.属性('ilvl') ?? '0')
        const so = o.找('startOverride', W)
        覆盖.set(ilvl, so ? Number(so.属性('val')) : null)
      }
      this.实例表.set(numId, { 抽象, 覆盖 })
    }
  }

  /** 这个 numId 有没有定义 */
  有 (numId) {
    return this.实例表.has(String(numId))
  }

  /**
   * 推进计数并给出标签。
   * @param {string|number} numId
   * @param {number} ilvl
   * @returns {{标签:string, 层级:number}}
   */
  下一 (numId, ilvl) {
    const id = String(numId)
    const 实例 = this.实例表.get(id)
    const 级别 = String(ilvl)
    if (!实例) return { 标签: '', 层级: ilvl }

    const 层 = this.抽象表.get(实例.抽象)
    const 定义 = 层?.get(级别)
    if (!定义) return { 标签: '', 层级: ilvl }

    // 本层推进
    const 键 = `${id}|${级别}`
    const 覆盖起点 = 实例.覆盖.get(级别)
    if (!this.计数.has(键)) this.计数.set(键, 覆盖起点 ?? 定义.起始)
    else this.计数.set(键, this.计数.get(键) + 1)

    // 更深的层归零(下一步会重新从起始开始)
    for (let d = ilvl + 1; d <= 8; d++) this.计数.delete(`${id}|${d}`)

    // 组装 lvlText(%1 对应 ilvl0)
    const 文本 = 定义.格式 === 'bullet' ? (定义.文本 || '•') : 替换模板(定义.文本, (i) => {
      const 子层 = 层.get(String(i))
      const 子键 = `${id}|${i}`
      const 值 = this.计数.get(子键) ?? (子层 ? 子层.起始 : 1)
      return 格式化序号(子层?.格式 || 'decimal', 值)
    })

    return { 标签: 文本 || 定义.文本, 层级: ilvl }
  }

  /** 只读当前标签(不推进),用于 getter 场景 */
  当前 (numId, ilvl) {
    const id = String(numId)
    const 实例 = this.实例表.get(id)
    const 层 = 实例 ? this.抽象表.get(实例.抽象) : null
    const 定义 = 层?.get(String(ilvl))
    if (!定义) return ''
    if (定义.格式 === 'bullet') return 定义.文本 || '•'
    return 替换模板(定义.文本, (i) => 格式化序号(层.get(String(i))?.格式 || 'decimal', this.计数.get(`${id}|${i}`) ?? 1))
  }
}

/** 把 `%1` 这类占位换成序号(1 起是 ilvl0) */
function 替换模板 (模板, 取值) {
  if (!模板) return ''
  return 模板.replace(/%([1-9])/g, (_, d) => 取值(Number(d) - 1))
}
