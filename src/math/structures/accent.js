/** 重音符 `m:acc`、上下划线 `m:bar`、组字符 `m:groupChr` */
import { 公式结构 } from '../structure.js'
import { M as 公式ns } from '../../ooxml/ns.js'
import { 重音符 as 重音符表 } from '../latex.js'

export class 重音符 extends 公式结构 {
  static 元素 = ['acc']

  转 (节点, 上下文) {
    const chr = 节点.找('accPr', 公式ns)?.找('chr', 公式ns)?.属性('val') || '\u0302'
    const 命令 = 重音符表[chr] || '\\hat'
    const 底 = 节点.找('e', 公式ns)
    return `${命令}{${底 ? 上下文.转子(底) : ''}}`
  }
}

export class 上下划线 extends 公式结构 {
  static 元素 = ['bar']

  转 (节点, 上下文) {
    const 位置 = 节点.找('barPr', 公式ns)?.找('pos', 公式ns)?.属性('val') || 'bot'
    const 底 = 节点.找('e', 公式ns)
    const 内容 = 底 ? 上下文.转子(底) : ''
    return 位置 === 'top' ? `\\overline{${内容}}` : `\\underline{${内容}}`
  }
}

export class 组字符 extends 公式结构 {
  static 元素 = ['groupChr']

  转 (节点, 上下文) {
    const chr = 节点.找('groupChrPr', 公式ns)?.找('chr', 公式ns)?.属性('val') || '⏟'
    const 位置 = 节点.找('groupChrPr', 公式ns)?.找('pos', 公式ns)?.属性('val') || 'bot'
    const 底 = 节点.找('e', 公式ns)
    const 内容 = 底 ? 上下文.转子(底) : ''
    // 下花括号/上花括号是常见形态,其余按字符当运算符处理
    if (chr === '⏟') return `\\underbrace{${内容}}`
    if (chr === '⏞') return `\\overbrace{${内容}}`
    return 位置 === 'top' ? `\\overset{${chr}}{${内容}}` : `\\underset{${chr}}{${内容}}`
  }
}
