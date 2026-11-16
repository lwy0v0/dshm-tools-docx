/**
 * 极简命名空间感知 XML 解析器(只读,零依赖)。
 *
 * 为什么要自己写:docx 里的 XML 有命名空间前缀、实体、CDATA,而本仓不允许引第三方库。
 * 只需要「建树 + 按名字找」这一层能力,不追求校验、不做 DTD。
 */

/** XML 节点(元素) */
export class XmlNode {
  /**
   * @param {string} uri 命名空间 URI
   * @param {string} 前缀
   * @param {string} 名 本地名
   * @param {Map<string, string>} 属性表 键为 `${uri}|${本地名}`
   * @param {XmlNode|null} 父
   */
  constructor (uri, 前缀, 名, 属性表, 父) {
    this.uri = uri || ''
    this.前缀 = 前缀 || ''
    this.名 = 名
    this.父 = 父 || null
    /** @type {XmlNode[]} */
    this.子 = []
    /** 直属文本片段 */
    this.文本片段 = ''
    this.属性表 = 属性表 || new Map()
    /** 属性原文(带前缀),序列化回字符串时用 */
    this.属性列表 = []
    /** 本节点上声明的命名空间(prefix → uri),序列化时原样带上 */
    this.声明 = new Map()
  }

  /** 直属文本(不含子元素里的文本) */
  文本 () {
    return this.文本片段
  }

  /** 递归取所有文本 */
  全部文本 () {
    let s = this.文本片段
    for (const c of this.子) s += c.全部文本()
    return s
  }

  /**
   * 序列化回 XML 字符串(**保留原前缀**)。
   * 用途:回写时把"没建模的原始片段"原样搬回新文档。
   */
  转字符串 () {
    const 名 = this.前缀 ? `${this.前缀}:${this.名}` : this.名
    const 属性 = []
    for (const [k, v] of this.声明) {
      属性.push(k === '' ? `xmlns="${转义属性(v)}"` : `xmlns:${k}="${转义属性(v)}"`)
    }
    for (const [键, 值] of this.属性列表) {
      属性.push(`${键}="${转义属性(值)}"`)
    }
    const 开头 = `<${名}${属性.length ? ' ' + 属性.join(' ') : ''}`
    if (!this.子.length && !this.文本片段) return `${开头}/>`
    const 内容 = 转义文本(this.文本片段) + this.子.map(c => c.转字符串()).join('')
    return `${开头}>${内容}</${名}>`
  }

  /**
   * 取属性值。先按「本地名」找(忽略命名空间),这也是最常见用法。
   * @param {string} 名
   * @returns {string|undefined}
   */
  属性 (名) {
    for (const [键, 值] of this.属性表) {
      const 本地 = 键.slice(键.indexOf('|') + 1)
      if (本地 === 名) return 值
    }
    return undefined
  }

  /**
   * 找第一个匹配的子元素。
   * @param {string} 名 本地名
   * @param {string[]} [uris] 限定命名空间集合;省略则不限定
   */
  找 (名, uris) {
    for (const c of this.子) {
      if (c.名 === 名 && (!uris || uris.includes(c.uri))) return c
    }
    return null
  }

  /**
   * 找所有匹配的子元素。
   * @param {string} 名
   * @param {string[]} [uris]
   */
  找全部 (名, uris) {
    const 结果 = []
    for (const c of this.子) {
      if (c.名 === 名 && (!uris || uris.includes(c.uri))) 结果.push(c)
    }
    return 结果
  }

  有没有 (名, uris) {
    return this.找(名, uris) !== null
  }

  /** 路径(排查用):`w:document/w:body/w:p` */
  路径 () {
    const 段 = []
    let 当 = this
    while (当) {
      段.unshift(当.前缀 ? `${当.前缀}:${当.名}` : 当.名)
      当 = 当.父
    }
    return 段.join('/')
  }

  /**
   * 可回写的锚点路径:`w:document/w:body/w:p[12]`,
   * 嵌套时 `…/w:tbl[3]/w:tr[0]/w:tc[1]/w:p[0]`。
   * 回写器靠它把"编辑视图里的块"对回原始 XML —— 同一次解析内稳定,重解析也稳定(按元素序号)。
   */
  锚路径 () {
    const 段 = []
    let 当 = this
    while (当) {
      if (!当.父) {
        段.unshift(当.前缀 ? `${当.前缀}:${当.名}` : 当.名)
        break
      }
      // 序号按**同名兄弟**算(与 `按锚找` 的取法一致,不能按全部子节点算)
      const 同名 = 当.父.子.filter(c => c.名 === 当.名)
      const 序号 = 同名.indexOf(当)
      段.unshift(`${当.前缀 ? 当.前缀 + ':' : ''}${当.名}[${序号}]`)
      当 = 当.父
    }
    return 段.join('/')
  }
}

export class XmlError extends Error {}

/**
 * 递归找第一个匹配的后代(含任意深度)。
 * 放在这里而不是某个业务模块里,是为了避免模块互相 import 形成环。
 * @param {XmlNode} 节点
 * @param {string} 名 本地名
 * @param {string[]} [uris] 限定命名空间
 */
export function 找后代 (节点, 名, uris) {
  for (const c of 节点.子) {
    if (c.名 === 名 && (!uris || uris.includes(c.uri))) return c
    const 深 = 找后代(c, 名, uris)
    if (深) return 深
  }
  return null
}

/**
 * 递归找所有匹配的后代。
 * @param {XmlNode} 节点
 * @param {string} 名
 * @param {string[]} [uris]
 */
export function 找所有后代 (节点, 名, uris) {
  const 出 = []
  for (const c of 节点.子) {
    if (c.名 === 名 && (!uris || uris.includes(c.uri))) 出.push(c)
    出.push(...找所有后代(c, 名, uris))
  }
  return 出
}

const 实体 = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** 文本节点转义 */
function 转义文本 (s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 属性值转义 */
function 转义属性 (s) {
  return 转义文本(s).replace(/"/g, '&quot;')
}

function 解实体 (s) {
  if (s.indexOf('&') < 0) return s
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (全, 体) => {
    if (体[0] === '#') {
      const 码 = 体[1] === 'x' || 体[1] === 'X'
        ? parseInt(体.slice(2), 16)
        : parseInt(体.slice(1), 10)
      return Number.isFinite(码) ? String.fromCodePoint(码) : 全
    }
    const 值 = 实体[体]
    return 值 === undefined ? 全 : 值
  })
}

/**
 * 解析 XML 文本,返回根元素。
 * @param {string} 源
 * @returns {XmlNode}
 */
export function 解析Xml (源) {
  const s = 源.replace(/^\uFEFF/, '')
  const 长 = s.length
  let i = 0
  /** @type {XmlNode|null} 根 */
  let 根 = null
  /** 栈:每层是 { 节点, 命名空间表 } */
  const 栈 = []

  /** 当前有效命名空间表 */
  const 当前表 = () => (栈.length ? 栈[栈.length - 1].命名空间表 : new Map())

  function 跳过空白 () {
    while (i < 长 && s.charCodeAt(i) <= 32) i++
  }

  while (i < 长) {
    const lt = s.indexOf('<', i)
    if (lt < 0) {
      // 尾部纯文本(理论上不该出现,根节点之后的文本忽略)
      break
    }
    if (lt > i && 栈.length) {
      const 片段 = 解实体(s.slice(i, lt))
      栈[栈.length - 1].节点.文本片段 += 片段
    }
    i = lt

    // 注释
    if (s.startsWith('<!--', i)) {
      const 尾 = s.indexOf('-->', i + 4)
      i = 尾 < 0 ? 长 : 尾 + 3
      continue
    }
    // CDATA
    if (s.startsWith('<![CDATA[', i)) {
      const 尾 = s.indexOf(']]>', i + 9)
      const 体 = s.slice(i + 9, 尾 < 0 ? 长 : 尾)
      if (栈.length) 栈[栈.length - 1].节点.文本片段 += 体
      i = 尾 < 0 ? 长 : 尾 + 3
      continue
    }
    // 处理指令 / DOCTYPE
    if (s.startsWith('<?', i)) {
      const 尾 = s.indexOf('?>', i + 2)
      i = 尾 < 0 ? 长 : 尾 + 2
      continue
    }
    if (s.startsWith('<!', i)) {
      // <!DOCTYPE ...> 可能有内部子集,简单跳到第一个 '>'
      const 尾 = s.indexOf('>', i + 2)
      i = 尾 < 0 ? 长 : 尾 + 1
      continue
    }
    // 结束标签
    if (s.charCodeAt(i + 1) === 47 /* / */) {
      const 尾 = s.indexOf('>', i + 2)
      if (尾 < 0) throw new XmlError('结束标签没有收尾')
      const 名 = s.slice(i + 2, 尾).trim()
      if (!栈.length) throw new XmlError(`多余的结束标签 </${名}>`)
      const 顶 = 栈.pop()
      if (顶.节点.名 !== 名.split(':').pop()) {
        throw new XmlError(`标签不匹配:<${顶.节点.名}> 遇到 </${名}>`)
      }
      i = 尾 + 1
      continue
    }

    // 开始标签:先扫到标签结束的 '>'(跳过引号里的)
    let j = i + 1
    let 引 = ''
    while (j < 长) {
      const ch = s[j]
      if (引) {
        if (ch === 引) 引 = ''
      } else if (ch === '"' || ch === "'") {
        引 = ch
      } else if (ch === '>') {
        break
      }
      j++
    }
    if (j >= 长) throw new XmlError('开始标签没有收尾')

    let 体 = s.slice(i + 1, j)
    const 自闭 = 体.endsWith('/')
    if (自闭) 体 = 体.slice(0, -1)

    const 名结尾 = 体.search(/[\s/]/)
    const 全名 = 名结尾 < 0 ? 体 : 体.slice(0, 名结尾)
    const 冒 = 全名.indexOf(':')
    const 前缀 = 冒 < 0 ? '' : 全名.slice(0, 冒)
    const 本地名 = 冒 < 0 ? 全名 : 全名.slice(冒 + 1)

    // 属性
    const 属性表 = new Map()
    const 新命名空间 = new Map()
    const 属性原文 = []
    let k = 名结尾 < 0 ? 体.length : 名结尾
    while (k < 体.length) {
      while (k < 体.length && 体.charCodeAt(k) <= 32) k++
      if (k >= 体.length) break
      let 键尾 = k
      while (键尾 < 体.length && 体[键尾] !== '=' && 体.charCodeAt(键尾) > 32) 键尾++
      const 键 = 体.slice(k, 键尾)
      let p = 键尾
      while (p < 体.length && 体[p] !== '=') p++
      p++ // 跳过 =
      while (p < 体.length && 体.charCodeAt(p) <= 32) p++
      let 值 = ''
      if (p < 体.length) {
        const 引号 = 体[p]
        if (引号 === '"' || 引号 === "'") {
          const 值尾 = 体.indexOf(引号, p + 1)
          值 = 体.slice(p + 1, 值尾 < 0 ? 体.length : 值尾)
          k = 值尾 < 0 ? 体.length : 值尾 + 1
        } else {
          let 值尾 = p
          while (值尾 < 体.length && 体.charCodeAt(值尾) > 32) 值尾++
          值 = 体.slice(p, 值尾)
          k = 值尾
        }
      } else {
        k = p
      }
      值 = 解实体(值)

      if (键 === 'xmlns') 新命名空间.set('', 值)
      else if (键.startsWith('xmlns:')) 新命名空间.set(键.slice(6), 值)
      else {
        const 键冒 = 键.indexOf(':')
        const 键前缀 = 键冒 < 0 ? '' : 键.slice(0, 键冒)
        const 键本地 = 键冒 < 0 ? 键 : 键.slice(键冒 + 1)
        // 属性的命名空间:只有带前缀的属性才有(默认命名空间不作用于属性)
        const 键uri = 键前缀 ? (新命名空间.get(键前缀) ?? 当前表().get(键前缀) ?? '') : ''
        属性原文.push([键, 值])
        属性表.set(`${键uri}|${键本地}`, 值)
      }
    }

    // 合并命名空间表(父 → 本节点覆盖)
    const 表 = new Map(当前表())
    for (const [k2, v2] of 新命名空间) 表.set(k2, v2)
    const uri = 前缀 ? (表.get(前缀) ?? '') : (表.get('') ?? '')

    const 节点 = new XmlNode(uri, 前缀, 本地名, 属性表, 栈.length ? 栈[栈.length - 1].节点 : null)
    节点.属性列表 = 属性原文
    节点.声明 = 新命名空间
    if (栈.length) 栈[栈.length - 1].节点.子.push(节点)
    else if (!根) 根 = 节点
    else throw new XmlError('XML 有多个根元素')

    if (!自闭) 栈.push({ 节点, 命名空间表: 表 })
    i = j + 1
  }

  if (!根) throw new XmlError('XML 里没有元素')
  return 根
}
