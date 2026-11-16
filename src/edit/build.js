/**
 * 回写器:`content.xml` + `raw/` 母版 → docx 字节。
 *
 * 策略(**重建 + 未建模回填**):
 * 1. `raw/` 的部件先全量继承;
 * 2. 主文档 `<w:body>`:普通段落/表格/图片按 content.xml 重建;
 *    标了 `w:readonly="1"`(或锚点对不上)的块 —— 按 `w:anchor` 从 raw 原文搬回;
 * 3. 段落属性**以 raw 为底**:只覆盖 content.xml 写了的字段,其余子元素
 *    (边框/底纹/制表位/框架/大纲级别…)原样保留;
 * 4. 页眉页脚按 content.xml 重建它们自己的部件;
 * 5. 图片只复用 raw 里已有的关系(找不到就跳过,不去改 rels —— 第一版不冒险)。
 */

import { OoxmlPackage } from '../ooxml/package.js'
import { Zip } from '../ooxml/zip.js'
import { ZipWriter } from '../ooxml/zip-write.js'
import { 解析Xml } from '../ooxml/xml.js'
import { 长度, 字号, 行距, 颜色, 角度, 百分比 } from './units.js'

export class 回写器 {
  /**
   * @param {object} 参数
   * @param {Buffer|string} 参数.raw docx 字节,或 raw 目录里原文档的路径
   * @param {string} 参数.内容xml
   * @param {'print'|'web'|undefined} [参数.视图] 指定文档打开时的默认视图;
   *        `print` = 页面视图(正式文档/论文用)。**不传就不动**原文档的设置。
   */
  constructor ({ raw, 内容xml, 视图 }) {
    this.raw包 = Buffer.isBuffer(raw) ? new OoxmlPackage(new Zip(raw)) : OoxmlPackage.打开文件(raw)
    this.主文档 = this.raw包.主文档路径()
    this.内容根 = 解析Xml(内容xml)
    this.body = this.内容根.找('body') || this.内容根
    this.新部件 = new Map()
    this.视图 = 视图 || null
  }

  /** 造出 docx 字节 */
  造 () {
    for (const 名 of this.raw包.列出()) {
      const 字节 = this.raw包.字节(名)
      if (字节) this.新部件.set(名, 字节)
    }

    const 主根 = this.raw包.xml(this.主文档)
    const 原body = 主根.找('body')
    // 注意:`正文内容` 只是 body 的子节点,必须包回 `<w:body>` —— 少了这一层,Word 会判定文档无效(打开一片空白)
    const 新body = `<w:body${保留原文属性(原body, ['w:rsidR', 'w:rsidRDefault', 'w:rsidP', 'w14:paraId'])}>` +
      this.重建容器(this.body) +
      '</w:body>'
    this.新部件.set(this.主文档, Buffer.from(this.包壳(主根, 主根.前缀 ? `${主根.前缀}:${主根.名}` : 主根.名, 新body), 'utf8'))

    this.重建附属部件()
    if (this.视图) this.设置默认视图(this.视图)

    const zip = new ZipWriter()
    for (const [名, 字节] of this.新部件) zip.加(名, 字节)
    return zip.打包()
  }

  /**
   * 改文档打开时的默认视图(`settings.xml` 的 `w:view`)。
   *
   * 只有调用方明确要求时才改 —— 视图模式平时是读者端设置,不该被插件动;
   * 但**正式文档(论文/报告)必须按页看**,排版时传 `视图: 'print'` 就能让收件人一打开就是页面视图。
   * @param {'print'|'web'|'outline'|'normal'} 视图
   */
  设置默认视图 (视图) {
    const 名 = [...this.新部件.keys()].find(n => n.endsWith('/settings.xml') || n === 'settings.xml')
    if (!名) return
    const 原文 = this.新部件.get(名).toString('utf8')
    let 新文 = null
    if (/<w:view\b[^>]*\/>/.test(原文)) 新文 = 原文.replace(/<w:view\b[^>]*\/>/, `<w:view w:val="${视图}"/>`)
    else if (/<w:settings\b[^>]*>/.test(原文)) 新文 = 原文.replace(/(<w:settings\b[^>]*>)/, `$1<w:view w:val="${视图}"/>`)
    if (新文 && 新文 !== 原文) this.新部件.set(名, Buffer.from(新文, 'utf8'))
  }

  /** 重建容器的子节点(段落/表格/分节/修订) */
  重建容器 (容器) {
    const 出 = []
    for (const 子 of 容器.子) {
      const 锚 = 子.属性('anchor')
      if (子.属性('readonly') === '1') {
        const 原 = this.按锚找(锚)
        if (原) { 出.push(原.转字符串()); continue }
      }
      switch (子.名) {
        case 'p': 出.push(this.重建段落(子, 锚)); break
        case 'tbl': 出.push(this.重建表格(子, 锚)); break
        case 'sectPr': {
          // 页面设置可编辑:我们写了的(pgSz/pgMar/cols/type)覆盖,其余(raw 里的页眉页脚引用等)原样搬
          出.push(this.重建分节(子, 锚))
          break
        }
        case 'ins':
        case 'del': {
          出.push(`<w:${子.名}${原文属性(子)}>${this.重建容器(子)}</w:${子.名}>`)
          break
        }
        default: {
          // 其余(sdt/unknown/unavailable/table 内的注释…):能对回 raw 就搬回
          const 原 = this.按锚找(锚)
          if (原) 出.push(原.转字符串())
          break
        }
      }
    }
    return 出.join('')
  }

  /** 分节:页面设置按 content.xml 覆盖,其余子元素从 raw 继承 */
  重建分节 (节点, 锚) {
    const 原 = this.按锚找(锚)
    const 子 = []

    const 宽 = 长度.转缇(节点.属性('pageW'))
    const 高 = 长度.转缇(节点.属性('pageH'))
    if (宽 !== null && 高 !== null) {
      const 横 = 节点.属性('orient') === 'landscape'
      子.push(`<w:pgSz w:w="${宽}" w:h="${高}"${横 ? ' w:orient="landscape"' : ''}/>`)
    }

    const 边 = ['marginTop', 'marginBottom', 'marginLeft', 'marginRight'].map(k => 长度.转缇(节点.属性(k)))
    const 页眉距 = 长度.转缇(节点.属性('headerDist'))
    const 页脚距 = 长度.转缇(节点.属性('footerDist'))
    const 装订 = 长度.转缇(节点.属性('gutter'))
    if (边.some(v => v !== null) || 页眉距 !== null || 页脚距 !== null || 装订 !== null) {
      const [上, 下, 左, 右] = 边.map(v => v ?? 0)
      // 页眉页脚距:没写就沿用 raw(或 Word 默认 1.27cm=720)
      子.push(`<w:pgMar w:top="${上}" w:bottom="${下}" w:left="${左}" w:right="${右}"` +
        ` w:header="${页眉距 ?? 720}" w:footer="${页脚距 ?? 720}" w:gutter="${装订 ?? 0}"/>`)
    }

    const 栏数 = 节点.属性('cols')
    if (栏数) 子.push('<w:cols w:num="' + 转义(栏数) + '"/>')
    const 类型 = 节点.属性('sectionType')
    if (类型) 子.push('<w:type w:val="' + 转义(类型) + '"/>')

    // 文档网格(中文排版:每页行数 × 每行字符数)
    const 网格行距 = 节点.属性('gridLine')
    if (网格行距) {
      const 行距值 = Number(网格行距)
      const 类型值 = 节点.属性('gridType') || 'lines'
      子.push(`<w:docGrid w:type="${转义(类型值)}" w:linePitch="${Number.isFinite(行距值) ? 行距值 : 312}"/>`)
    }

    if (节点.属性('titlePg') === '1') 子.push('<w:titlePg/>')
    const 竖直对齐 = 节点.属性('vAlign')
    if (竖直对齐) 子.push(`<w:vAlign w:val="${转义(竖直对齐)}"/>`)
    const 页码起始 = 节点.属性('pageNumStart')
    if (页码起始) 子.push(`<w:pgNumType w:start="${转义(页码起始)}"/>`)

    // raw 里其余子元素(headerReference/footerReference…)原样继承;最后统一按 schema 顺序排列
    const 已处理 = new Set(['pgSz', 'pgMar', 'cols', 'type', 'docGrid', 'titlePg', 'vAlign', 'pgNumType'])
    if (原) {
      for (const c of 原.子) if (!已处理.has(c.名)) 子.push(c.转字符串())
    }
    return 子.length ? `<w:sectPr>${排序拼接('sectPr', 子)}</w:sectPr>` : '<w:sectPr/>'
  }

  /** 段落:重建 pPr(以 raw 为底)+ run 们 */
  重建段落 (内容节点, 锚) {
    const 原段落 = this.按锚找(锚)
    const pPr = this.造段落属性(内容节点, 原段落?.找('pPr'))
    let runs = 内容节点.子
      .filter(c => c.名 !== 'pPr')
      .map(c => this.重建行内(c))
      .join('')
    // `w:pageBreak="1"`:硬分页 —— 在段首插一个分页符 run(不依赖 pageBreakBefore 是否被尊重)
    if (内容节点.属性('pageBreak') === '1') runs = '<w:r><w:br w:type="page"/></w:r>' + runs
    return `<w:p${保留原文属性(原段落, ['w:rsidR', 'w:rsidRDefault', 'w:rsidP', 'w14:paraId', 'w14:textId'])}>${pPr}${runs}</w:p>`
  }

  /** 段落属性:content.xml 的扁平属性 → pPr 子元素;raw 里其余子元素原样搬 */
  造段落属性 (内容节点, 原pPr) {
    const 子 = []
    const 样式 = 内容节点.属性('pStyle')
    if (样式) 子.push(`<w:pStyle w:val="${转义(样式)}"/>`)

    子.push(...造编号(内容节点), ...造间距(内容节点), ...造缩进(内容节点))
    const 对齐 = 内容节点.属性('jc')
    if (对齐) 子.push(`<w:jc w:val="${转义(对齐)}"/>`)
    if (内容节点.属性('pageBreakBefore') === '1') 子.push('<w:pageBreakBefore/>')
    if (内容节点.属性('keepNext') === '1') 子.push('<w:keepNext/>')

    // 首字下沉:content.xml 里写了就按它重建,否则由下面"raw 兜底"继承
    const 下沉 = 内容节点.属性('frame-drop')
    if (下沉) {
      const 行数 = 内容节点.属性('frame-lines')
      子.push(`<w:framePr w:dropCap="${转义(下沉)}"${行数 ? ` w:lines="${转义(行数)}"` : ''} w:wrap="around" w:vAnchor="text" w:hAnchor="text"/>`)
    }

    // 段落标记本身的格式(`w:pPr/w:rPr`)不建模、也不继承:它是看不见的"段落号"格式,
    // 照抄会让改过字号的段落保留旧行高(例如首字下沉留下的 58.5pt)。
    const 已处理 = new Set(['pStyle', 'jc', 'spacing', 'ind', 'numPr', 'pageBreakBefore', 'keepNext', 'rPr'])
    if (原pPr) {
      for (const c of 原pPr.子) {
        if (已处理.has(c.名)) continue
        if (下沉 && c.名 === 'framePr') continue // 已按 content.xml 重建
        子.push(c.转字符串())
      }
    }
    // schema 顺序很重要:pageBreakBefore/keepNext 排在 jc 之后时 Word 会忽略分页
    return 子.length ? `<w:pPr>${排序拼接('pPr', 子)}</w:pPr>` : ''
  }

  /** 行内:文本 run / 图片 / 公式(回填) / 超链接包装 */
  重建行内 (节点) {
    if (节点.名 === 'hyperlink') {
      const 目标 = 节点.属性('target') || ''
      const 内 = 节点.子.map(c => this.重建行内(c)).join('')
      if (!内) return ''
      if (目标.startsWith('#')) return `<w:hyperlink w:anchor="${转义(目标.slice(1))}">${内}</w:hyperlink>`
      const rid = this.取链接关系(目标)
      return rid ? `<w:hyperlink r:id="${rid}">${内}</w:hyperlink>` : 内
    }
    if (节点.名 !== 'r') return ''
    const rPr = 造run属性(节点)
    const 体 = []
    for (const c of 节点.子) {
      if (c.名 === 'rPr') continue
      if (c.名 === 't') { 体.push(`<w:t xml:space="preserve">${转义(c.文本())}</w:t>`); continue }
      if (c.名 === 'drawing') { 体.push(this.造图片(c)); continue }
      if (c.名 === 'footnoteRef' || c.名 === 'endnoteRef') {
        const id = c.属性('id')
        if (id) 体.push(`<w:${c.名 === 'footnoteRef' ? 'footnoteReference' : 'endnoteReference'} w:id="${转义(id)}"/>`)
        continue
      }
      if (c.名 === 'oMath') {
        const 原 = this.按锚找(c.属性('anchor'))
        if (原) 体.push(原.转字符串())
      }
    }
    return 体.length ? `<w:r>${rPr}${体.join('')}</w:r>` : ''
  }

  /** 图片:按序列化属性重建 inline / anchor */
  造图片 (节点) {
    const 源 = 节点.属性('src')
    if (!源) return ''
    const rid = this.取已有关系(源)
    if (!rid) return '' // 找不到关系就跳过(第一版不改 rels)

    const 宽 = 长度.转EMU(节点.属性('width') || '1in')
    const 高 = 长度.转EMU(节点.属性('height') || '1in')
    const 图 = `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="pic"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}"/>${造裁剪(节点.属性('crop'))}</pic:blipFill>` +
      `<pic:spPr>${造变换(节点.属性('rotate'), 宽, 高)}</pic:spPr></pic:pic></a:graphicData></a:graphic>`
    const docPr = `<wp:docPr id="1" name="pic" descr="${转义(节点.属性('alt') || '')}"/>`

    if (节点.属性('kind') === 'anchor') {
      const [相对H, 偏移H, 对齐H] = 拆定位(节点.属性('posH'))
      const [相对V, 偏移V, 对齐V] = 拆定位(节点.属性('posV'))
      return `<w:drawing><wp:anchor behindDoc="${节点.属性('behindDoc') === '1' ? 1 : 0}" locked="${节点.属性('locked') === '1' ? 1 : 0}" ` +
        'distT="0" distB="0" distL="0" distR="0" simplePos="0">' +
        '<wp:simplePos x="0" y="0"/>' +
        `<wp:positionH relativeFrom="${相对H || 'column'}">${偏移H ? `<wp:posOffset>${长度.转EMU(偏移H)}</wp:posOffset>` : `<wp:align>${对齐H || 'left'}</wp:align>`}</wp:positionH>` +
        `<wp:positionV relativeFrom="${相对V || 'paragraph'}">${偏移V ? `<wp:posOffset>${长度.转EMU(偏移V)}</wp:posOffset>` : `<wp:align>${对齐V || 'top'}</wp:align>`}</wp:positionV>` +
        `<wp:extent cx="${宽}" cy="${高}"/><wp:wrapSquare wrapText="bothSides"/>${docPr}${图}</wp:anchor></w:drawing>`
    }
    return '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
      `<wp:extent cx="${宽}" cy="${高}"/>${docPr}${图}</wp:inline></w:drawing>`
  }

  /** 目标部件 → raw 里已有的 rId;没有就**新增一条关系** */
  取已有关系 (部件路径) {
    for (const [rid, r] of Object.entries(this.raw包.关系(this.主文档))) {
      if (r.目标 === 部件路径) return rid
    }
    return this.新增关系(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
      部件路径.replace(/^word\//, ''),
      false
    )
  }

  /** 外链地址 → rId(没有就新增外部关系) */
  取链接关系 (地址) {
    for (const [rid, r] of Object.entries(this.raw包.关系(this.主文档))) {
      if (r.类型.endsWith('/hyperlink') && r.目标 === 地址) return rid
    }
    return this.新增关系(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
      地址,
      true
    )
  }

  /**
   * 往主文档的 rels 里追加一条关系,返回新 rId(**同一目标只加一次**)。
   * 找不到 rels 部件时返回 null —— 宁可丢链接,也不写出坏包。
   */
  新增关系 (类型, 目标, 外部) {
    this.缓存新增 ??= new Map()
    const 键 = `${类型}|${目标}`
    if (this.缓存新增.has(键)) return this.缓存新增.get(键)

    const rels路径 = 部件rels路径(this.主文档)
    const 原文 = this.新部件.get(rels路径)?.toString('utf8') ?? this.raw包.文本(rels路径)
    if (!原文) return null

    const 已用 = new Set(Object.keys(this.raw包.关系(this.主文档)))
    let 序号 = 已用.size + (this.缓存新增.size + 1)
    let id = `rIdMiao${序号}`
    while (已用.has(id)) { 序号++; id = `rIdMiao${序号}` }

    const 新行 = `<Relationship Id="${id}" Type="${类型}" Target="${转义(目标)}"${外部 ? ' TargetMode="External"' : ''}/>`
    const 新文本 = 原文.replace(/<\/Relationships>\s*$/, `${新行}</Relationships>`)
    this.新部件.set(rels路径, Buffer.from(新文本, 'utf8'))
    this.缓存新增.set(键, id)
    return id
  }

  /** 表格 */
  重建表格 (内容节点, 锚) {
    const 原 = this.按锚找(锚)
    const tblPr = 原?.找('tblPr') ? 原.找('tblPr').转字符串() : '<w:tblPr/>'
    const 宽度 = 内容节点.属性('grid')
    const grid = 宽度
      ? `<w:tblGrid>${宽度.split(',').map(v => `<w:gridCol w:w="${长度.转缇(v) ?? 0}"/>`).join('')}</w:tblGrid>`
      : ''
    const 行们 = []
    for (const 行 of 内容节点.子) {
      if (行.名 !== 'tr') continue
      const 格们 = []
      for (const 格 of 行.子) {
        if (格.名 !== 'tc') continue
        格们.push(`<w:tc>${造格属性(格)}${this.重建容器(格)}</w:tc>`)
      }
      行们.push(`<w:tr>${造行属性(行)}${格们.join('')}</w:tr>`)
    }
    return `<w:tbl>${tblPr}${grid}${行们.join('')}</w:tbl>`
  }

  /** 页眉页脚:重建它自己的部件 */
  重建附属部件 () {
    for (const 节点 of this.body.子) {
      if (节点.名 !== 'hdr' && 节点.名 !== 'ftr') continue
      const 部件 = 节点.属性('part')
      if (!部件 || !this.新部件.has(部件)) continue
      const 原根 = this.raw包.xml(部件)
      if (!原根) continue
      const 名 = 原根.前缀 ? `${原根.前缀}:${原根.名}` : 原根.名
      this.新部件.set(部件, Buffer.from(this.包壳(原根, 名, this.重建容器(节点)), 'utf8'))
    }
  }

  /** 用原始根元素的命名空间与属性包一层(缺的前缀补上,否则我们生成的 `a:`/`pic:` 解析不了) */
  包壳 (原根, 名, 内容) {
    const 声明 = new Map(原根.声明)
    for (const [前缀, uri] of Object.entries(必需命名空间)) if (!声明.has(前缀)) 声明.set(前缀, uri)

    const 属性 = []
    for (const [k, v] of 声明) 属性.push(k === '' ? `xmlns="${转义(v)}"` : `xmlns:${k}="${转义(v)}"`)
    for (const [k, v] of 原根.属性列表) {
      if (k === 'xmlns' || k.startsWith('xmlns:')) continue // 已由声明表处理
      属性.push(`${k}="${转义(v)}"`)
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<${名}${属性.length ? ' ' + 属性.join(' ') : ''}>${内容}</${名}>`
  }

  /** 按锚点路径找 raw 节点:`w:document/w:body[0]/w:p[10]` */
  按锚找 (锚) {
    if (!锚) return null
    const 段 = String(锚).split('/')
    let 当 = this.raw包.xml(this.主文档)
    if (!当 || 当.名 !== 段[0].split(':').pop()) return null
    for (let i = 1; i < 段.length; i++) {
      const m = /^([^[]+)\[(\d+)\]$/.exec(段[i])
      if (!m) return null
      const 名 = m[1].split(':').pop()
      const 序号 = Number(m[2])
      const 同名 = 当.子.filter(c => c.名 === 名)
      if (!同名[序号]) return null
      当 = 同名[序号]
    }
    return 当
  }
}

// —————————— 小工具(文件内私有) ——————————

/**
 * OOXML 的属性容器(`pPr` / `rPr` / `tcPr` / `sectPr` …)是 **sequence**,子元素顺序错了
 * Word 会忽略甚至判文档无效 —— 最典型的症状是"设了 `pageBreakBefore` 却不分页"。
 * 这里按 schema 顺序排一遍;表里没有的元素排在最后,并保持原有相对顺序。
 */
const 顺序表 = {
  pPr: ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'],
  rPr: ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'],
  tcPr: ['cnfStyle', 'tcW', 'gridSpan', 'hMerge', 'vMerge', 'tcBorders', 'shd', 'noWrap', 'tcMar', 'textDirection', 'tcFitText', 'vAlign', 'hideMark'],
  trPr: ['cnfStyle', 'divId', 'gridBefore', 'gridAfter', 'wBefore', 'wAfter', 'cantSplit', 'trHeight', 'tblHeader', 'tblCellSpacing', 'jc', 'hidden'],
  sectPr: ['headerReference', 'footerReference', 'footnotePr', 'endnotePr', 'type', 'pgSz', 'pgMar', 'paperSrc', 'pgBorders', 'lnNumType', 'pgNumType', 'cols', 'formProt', 'vAlign', 'noEndnote', 'titlePg', 'textDirection', 'bidi', 'rtlGutter', 'docGrid', 'printerSettings', 'sectPrChange']
}

/**
 * @param {keyof typeof 顺序表} 类别
 * @param {string[]} 片段们 每个以 `<w:xxx` 开头的 XML 串(或纯元素串)
 */
function 排序拼接 (类别, 片段们) {
  const 表 = 顺序表[类别] || []
  const 带序 = 片段们.map((串, 序) => {
    const m = /^<[^:>]*:?([A-Za-z0-9]+)/.exec(串)
    const 名 = m ? m[1] : ''
    const 位 = 表.indexOf(名)
    return { 串, 序, 位: 位 < 0 ? 表.length : 位 }
  })
  带序.sort((a, b) => a.位 - b.位 || a.序 - b.序)
  return 带序.map(x => x.串).join('')
}

/** 部件的 rels 路径:`word/document.xml` → `word/_rels/document.xml.rels` */
function 部件rels路径 (部件路径) {
  const 段 = 部件路径.split('/')
  const 文件 = 段.pop()
  return [...段, '_rels', `${文件}.rels`].join('/')
}

/** 回写时必须能解析的命名空间(原文档根上不一定声明全) */
const 必需命名空间 = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006'
}

function 造编号 (节点) {
  const numId = 节点.属性('numId')
  if (!numId) return []
  return [`<w:numPr><w:ilvl w:val="${转义(节点.属性('ilvl') || '0')}"/><w:numId w:val="${转义(numId)}"/></w:numPr>`]
}
function 造间距 (节点) {
  const 段 = []
  const 行 = 节点.属性('spacing-line')
  if (行) {
    const r = 行距.转(行)
    if (r) 段.push(`w:line="${r.行}" w:lineRule="${r.规则}"`)
  }
  for (const [属性, 元素] of [['spacing-before', 'w:before'], ['spacing-after', 'w:after']]) {
    const v = 长度.转缇(节点.属性(属性))
    if (v !== null) 段.push(`${元素}="${v}"`)
  }
  return 段.length ? [`<w:spacing ${段.join(' ')}/>`] : []
}

function 造缩进 (节点) {
  const 段 = []
  for (const [属性, 元素] of [['ind-left', 'w:left'], ['ind-right', 'w:right'], ['ind-firstLine', 'w:firstLine'], ['ind-hanging', 'w:hanging']]) {
    const v = 长度.转缇(节点.属性(属性))
    if (v !== null) 段.push(`${元素}="${v}"`)
  }
  return 段.length ? [`<w:ind ${段.join(' ')}/>`] : []
}

function 造run属性 (节点) {
  const 段 = []
  const 取 = (k) => 节点.属性(k)
  const 真 = (v) => v === '1' || v === 'true'
  if (取('rStyle')) 段.push(`<w:rStyle w:val="${转义(取('rStyle'))}"/>`)
  if (取('font')) 段.push(`<w:rFonts w:ascii="${转义(取('font'))}" w:eastAsia="${转义(取('font'))}"/>`)
  if (真(取('b'))) 段.push('<w:b/>')
  if (真(取('i'))) 段.push('<w:i/>')
  if (真(取('caps'))) 段.push('<w:caps/>')
  if (真(取('strike'))) 段.push('<w:strike/>')
  if (真(取('vanish'))) 段.push('<w:vanish/>')
  if (取('color')) 段.push(`<w:color w:val="${转义(颜色.转(取('color')))}"/>`)
  if (取('spacing')) 段.push(`<w:spacing w:val="${Math.round(Number.parseFloat(取('spacing')) * 20)}"/>`)
  if (取('scale')) 段.push(`<w:w w:val="${Math.round(Number.parseFloat(取('scale')))}"/>`)
  if (取('position')) 段.push(`<w:position w:val="${Math.round(Number.parseFloat(取('position')) * 2)}"/>`)
  const 半磅 = 字号.转半磅(取('sz'))
  if (半磅 !== null) 段.push(`<w:sz w:val="${半磅}"/>`)
  if (取('highlight')) 段.push(`<w:highlight w:val="${转义(取('highlight'))}"/>`)
  if (取('u')) 段.push(`<w:u w:val="${转义(取('u'))}"/>`)
  if (取('shd')) 段.push(`<w:shd w:val="clear" w:fill="${转义(颜色.转(取('shd')))}"/>`)
  if (取('vertAlign')) 段.push(`<w:vertAlign w:val="${转义(取('vertAlign'))}"/>`)
  if (取('em')) 段.push(`<w:em w:val="${转义(取('em'))}"/>`)
  return 段.length ? `<w:rPr>${排序拼接('rPr', 段)}</w:rPr>` : ''
}

function 造行属性 (行) {
  const 段 = []
  const 高 = 长度.转缇(行.属性('height'))
  if (高 !== null) {
    const 规则 = 行.属性('heightRule')
    段.push(`<w:trHeight w:val="${高}"${规则 ? ` w:hRule="${转义(规则)}"` : ''}/>`)
  }
  if (行.属性('header') === '1') 段.push('<w:tblHeader/>')
  return 段.length ? `<w:trPr>${排序拼接('trPr', 段)}</w:trPr>` : ''
}

function 造格属性 (格) {
  const 段 = []
  const 宽 = 长度.转缇(格.属性('width'))
  if (宽 !== null) 段.push(`<w:tcW w:w="${宽}" w:type="dxa"/>`)
  const 跨 = 格.属性('gridSpan')
  if (跨) 段.push(`<w:gridSpan w:val="${转义(跨)}"/>`)
  if (格.属性('vMerge') === 'restart') 段.push('<w:vMerge w:val="restart"/>')
  const 纹 = 格.属性('shading')
  if (纹) 段.push(`<w:shd w:val="clear" w:fill="${转义(颜色.转(纹))}"/>`)
  return 段.length ? `<w:tcPr>${排序拼接('tcPr', 段)}</w:tcPr>` : ''
}

function 造裁剪 (裁剪) {
  if (!裁剪) return ''
  const 段 = String(裁剪).split('/').map(v => 百分比.转(String(v).replace('%', '')) || 0)
  while (段.length < 4) 段.push(0)
  return `<a:srcRect l="${段[0]}" t="${段[1]}" r="${段[2]}" b="${段[3]}"/>`
}

function 造变换 (旋转, 宽, 高) {
  const rot = 旋转 ? ` rot="${角度.转(String(旋转).replace(/deg$/, ''))}"` : ''
  return `<a:xfrm${rot}><a:off x="0" y="0"/><a:ext cx="${宽}" cy="${高}"/></a:xfrm>`
}

function 拆定位 (值) {
  if (!值) return ['', '', '']
  const 段 = String(值).split('@')
  return [段[0] || '', 段[1] || '', 段[2] || '']
}

function 原文属性 (节点) {
  const 出 = []
  for (const [k, v] of 节点.属性列表) if (!['anchor', 'readonly'].includes(k.replace(/^w:/, ''))) 出.push(`${k}="${转义(v)}"`)
  return 出.length ? ' ' + 出.join(' ') : ''
}

function 保留原文属性 (节点, 键们) {
  if (!节点) return ''
  const 出 = []
  for (const [k, v] of 节点.属性列表) if (键们.includes(k)) 出.push(`${k}="${转义(v)}"`)
  return 出.length ? ' ' + 出.join(' ') : ''
}

function 转义 (s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
