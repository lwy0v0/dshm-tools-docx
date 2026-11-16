/**
 * 主文档遍历器:按 `w:body` 的顺序把每一块分发出去。
 *
 * 它是**唯一**知道"文档里有哪几种块"的地方;新增一类内容,在这里挂一行 + 写对应模块。
 */

import { W, M } from '../ooxml/ns.js'
import { 解析段落 } from './blocks/paragraph.js'
import { 解析表格 } from './blocks/table.js'
import { 解析分节, 解析页眉页脚 } from './blocks/section.js'
import { 解析注释区 } from './blocks/footnote.js'
import { 解析批注区 } from './blocks/comment.js'
import { AltChunk } from './blocks/altchunk.js'
import { 内容控件 } from './sdt.js'

/** 透明容器:递归进去就好,自己不出块 */
const 透明容器 = new Set([
  'customXml', 'smartTag', 'dir', 'bdo', 'tc', 'txbxContent',
  'hdr', 'ftr', 'footnote', 'endnote', 'comment', 'body'
])

export class 文档解析器 {
  /** @param {import('./context.js').WordContext} 上下文 */
  constructor (上下文) {
    this.上下文 = 上下文
  }

  /** 解析整篇,返回 { 块, 统计, 不可得, 资源 } */
  解析 () {
    const 上下文 = this.上下文
    上下文.用部件(上下文.主文档)
    上下文.解析块 = (节点) => this.遍历(节点)

    const 根 = 上下文.包.xml(上下文.主文档)
    if (!根) throw new Error('主文档解析失败')

    const body = 根.找('body', W) || 根
    const 块 = this.遍历(body)

    // 文末统一挂:页眉页脚 → 脚注/尾注 → 批注
    const 页眉页脚 = 解析页眉页脚(上下文)
    if (页眉页脚.length) 块.push(...页眉页脚)

    const 注释 = 解析注释区(上下文)
    if (注释) 块.push(...注释)

    const 批注 = 解析批注区(上下文)
    if (批注) 块.push(批注)

    return { 块, 统计: 上下文.统计, 不可得: 上下文.不可得, 资源: 上下文.资源 }
  }

  /**
   * 遍历一个容器,产出块数组。
   * @param {import('../ooxml/xml.js').XmlNode} 容器
   */
  遍历 (容器) {
    const 块 = []
    for (const 子 of 容器.子) {
      const 名 = 子.名

      // 段落与表格(最常见,先处理)
      if (名 === 'p' && W.includes(子.uri)) {
        块.push(...this.成段(子))
        continue
      }
      if (名 === 'tbl' && W.includes(子.uri)) {
        块.push(解析表格(子, this.上下文))
        continue
      }

      // 非 Word 命名空间:只关心直接出现的公式
      if (!W.includes(子.uri)) {
        if (M.includes(子.uri) && (名 === 'oMath' || 名 === 'oMathPara')) 块.push(...this.公式块(子))
        continue
      }

      switch (名) {
        case 'sectPr': {
          const 节 = 解析分节(子, this.上下文)
          if (节) 块.push(节)
          break
        }
        case 'sdt':
          块.push(...this.成内容控件(子))
          break
        case 'ins':
        case 'moveTo':
        case 'del':
        case 'moveFrom':
          块.push(...this.成修订区(子, 名))
          break
        case 'altChunk': {
          const 片段 = AltChunk.解析(子, this.上下文)
          if (片段) 块.push(片段)
          break
        }
        case 'bookmarkStart': {
          const 名子 = 子.属性('name')
          if (名子 && !名子.startsWith('_')) this.上下文.资源.书签.push(名子)
          break
        }
        case 'oMath':
        case 'oMathPara':
          块.push(...this.公式块(子))
          break
        default:
          // 未知块与透明容器:有子就继续往里找,别吞内容
          if (子.子.length) 块.push(...this.遍历(子))
          break
      }
    }
    return 块
  }

  /** 段落:解析后把附加块(图表/文本框)接在后面;段落级分节也一起处理 */
  成段 (节点) {
    const 出 = []
    const 段 = 解析段落(节点, this.上下文)
    if (段) {
      const 附加 = 段.附加
      delete 段.附加
      if (段.类型 !== '空') 出.push(段)
      if (附加?.length) 出.push(...附加)
    }
    const 节属性 = 节点.找('pPr', W)?.找('sectPr', W)
    if (节属性) {
      // 段落级分节:节属性挂在段落上,回写时必须整段原样保留,否则节会跑到 body 上
      if (段) 段.含未建模 = true
      const 节 = 解析分节(节属性, this.上下文)
      if (节) { 节.随段落 = true; 出.push(节) }
    }
    return 出
  }

  /** 内容控件:值型(复选框/下拉/日期…)出控件块,文字型出标签 + 内部块 */
  成内容控件 (节点) {
    const 控件 = 内容控件.解析(节点)
    const 内容 = 节点.找('sdtContent', W)
    const 内部 = 内容 ? this.遍历(内容) : []
    const 只是文字容器 = !控件 || 控件.类型 === '富文本' || 控件.类型 === '纯文本'

    if (只是文字容器) {
      const 出 = []
      if (控件?.标签) {
        出.push({ 类型: '段落', 片段: [{ 种类: '文本', 文本: `〔${控件.标签}〕`, 粗体: true }] })
      }
      出.push(...内部)
      return 出
    }

    this.上下文.统计.控件++
    return [{
      类型: '内容控件',
      控件类型: 控件.类型,
      标签: 控件.标签,
      值: 内部文本(内部),
      已勾选: 控件.已勾选,
      可选项: 控件.可选项,
      日期格式: 控件.日期格式,
      库: 控件.库,
      数据绑定: 控件.数据绑定,
      锚: this.上下文.锚(节点)
    }]
  }

  /** 块级修订(插入/删除/移动) */
  成修订区 (节点, 名) {
    const 内部 = this.遍历(节点)
    if (!内部.length) return []
    return [{
      类型: '修订区',
      修改类型: (名 === 'ins' || 名 === 'moveTo') ? '新增' : '删除',
      作者: 节点.属性('author') || '',
      时间: 节点.属性('date') || '',
      块: 内部
    }]
  }

  /** 独立公式块 */
  公式块 (节点) {
    const latex = this.上下文.公式.转(节点)
    if (!latex) return []
    this.上下文.统计.公式++
    this.上下文.资源.公式.push(latex)
    return [{ 类型: '段落', 片段: [{ 种类: '公式', latex, 独立: true }] }]
  }
}

/** 从块里抽纯文本(内容控件的"值"用) */
function 内部文本 (块) {
  let s = ''
  for (const b of 块) {
    if (b.片段) s += b.片段.map(f => f.文本 || f.latex || '').join('')
    else if (b.类型 === '表格') s += '[表格]'
  }
  return s.trim()
}

export { 透明容器 }
