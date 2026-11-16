/**
 * 序列化器:对象模型 → `content.xml`(可读可编辑视图)。
 *
 * 规则(已定):
 * - 元素名 = OOXML 元素名(`w:p` / `w:r` / `w:tbl` / `w:drawing`…);
 * - 属性**扁平化**:`w:ind-left`、`w:spacing-line`、`w:sz` 直接挂在元素上;
 * - 值写**人话**:`0.5in`、`14pt`、`1.5x`、`#C00000`;
 * - 每个块带 `w:anchor`(原始路径),回写时按它对回 raw 母版;
 * - 含未建模对象的段落标 `w:readonly="1"` —— 正文照样能读,但回写时整段原样搬回。
 */

import { 长度, 字号, 行距, 颜色, 角度, 百分比 } from './units.js'

/** 未建模 → 只读(回写时整段/整块原样搬回) */
const 只读种类 = new Set(['图表', '智能图形', '嵌入对象', '文本框', '不可得'])

export class 序列化器 {
  /**
   * @param {object} 解析结果 `{ 块, 统计, 不可得, 资源 }`
   * @param {object} 元信息 `{ 源, 版本, 转换时间 }`
   * @returns {string} content.xml
   */
  序列化 (解析结果, 元信息 = {}) {
    const 行 = []
    行.push('<?xml version="1.0" encoding="UTF-8"?>')
    行.push(`<!-- dshm-tools-docx 可编辑视图 v${元信息.版本 || '0'} · 源 ${转义(元信息.源 || '')} · ${元信息.转换时间 || ''} -->`)
    行.push('<!-- 读法:元素名=OOXML 元素名;属性已扁平化、值写人话(0.5in / 14pt / 1.5x / #C00000) -->')
    行.push('<!-- 规则:w:readonly="1" 的块含未建模对象,可以读但回写时原样保留,改了不生效 -->')
    行.push('<w:document' + this.根属性(元信息) + '>')
    行.push('<w:body>')
    行.push(...this.写块们(解析结果.块, 1))
    行.push('</w:body>')
    行.push('</w:document>')
    return 行.join('\n')
  }

  根属性 (元信息) {
    const 属性 = [
      ['xmlns:w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'],
      ['xmlns:r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'],
      ['xmlns:m', 'http://schemas.openxmlformats.org/officeDocument/2006/math'],
      ['xmlns:wp', 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'],
      ['xmlns:a', 'http://schemas.openxmlformats.org/drawingml/2006/main']
    ]
    if (元信息.源) 属性.push(['w:source', 元信息.源])
    if (元信息.sha) 属性.push(['w:sha', 元信息.sha])
    return 属性.map(([k, v]) => ` ${k}="${转义(v)}"`).join('')
  }

  // —————————— 块级 ——————————

  写块们 (块们, 深度) {
    const 行 = []
    for (const 块 of 块们) 行.push(...this.写块(块, 深度))
    return 行
  }

  写块 (块, 深度) {
    // 跟随段落的未建模块:由"整段回填"覆盖,这里不再单独输出
    if (块.随段落) return []
    // 页眉页脚 / 注释 / 批注:第一版不重建(部件原样继承,引用随段落回填)
    if (['页眉页脚', '注释区', '批注区'].includes(块.类型)) return []
    switch (块.类型) {
      case '标题':
      case '段落':
      case '列表':
        return this.写段落(块, 深度)
      case '表格':
        return this.写表格(块, 深度)
      case '分节':
        return [缩(深度) + '<w:sectPr' + 属性串({
          'w:desc': 块.描述,
          'w:pageW': 块.版式?.纸张 ? `${块.版式.纸张.宽}mm` : undefined,
          'w:pageH': 块.版式?.纸张 ? `${块.版式.纸张.高}mm` : undefined,
          'w:orient': 块.版式?.纸张?.方向 === 'landscape' ? 'landscape' : undefined,
          'w:marginTop': 块.版式?.页边距 ? `${块.版式.页边距.上}mm` : undefined,
          'w:marginBottom': 块.版式?.页边距 ? `${块.版式.页边距.下}mm` : undefined,
          'w:marginLeft': 块.版式?.页边距 ? `${块.版式.页边距.左}mm` : undefined,
          'w:marginRight': 块.版式?.页边距 ? `${块.版式.页边距.右}mm` : undefined,
          'w:headerDist': 块.版式?.页眉页脚距 ? `${块.版式.页眉页脚距.页眉}mm` : undefined,
          'w:footerDist': 块.版式?.页眉页脚距 ? `${块.版式.页眉页脚距.页脚}mm` : undefined,
          'w:gutter': 块.版式?.装订线 ? `${块.版式.装订线}mm` : undefined,
          'w:vAlign': 块.版式?.竖直对齐,
          'w:gridType': 块.版式?.网格?.类型,
          'w:gridLine': 块.版式?.网格?.行距 || undefined,
          'w:grid-lines-per-page': 块.版式?.网格?.每页行数 || undefined,
          'w:titlePg': 块.版式?.首页不同 ? '1' : undefined,
          'w:pageNumStart': 块.版式?.页码起始 ? String(块.版式.页码起始) : undefined,
          'w:cols': 块.版式?.栏数 ? String(块.版式.栏数) : undefined,
          'w:sectionType': 块.版式?.分节类型,
          'w:anchor': 块.锚?.路径
        }) + '/>']
      case '页眉页脚':
        return this.写页眉页脚(块, 深度)
      case '注释区':
        return this.写注释区(块, 深度)
      case '批注区':
        return this.写批注区(块, 深度)
      case '内容控件':
        return [缩(深度) + '<w:sdt' + 属性串({
          'w:type': 块.控件类型,
          'w:label': 块.标签,
          'w:value': 块.值,
          'w:checked': 块.已勾选 === undefined ? undefined : (块.已勾选 ? '1' : '0'),
          'w:options': 块.可选项?.join('|'),
          'w:anchor': 块.锚?.路径,
          'w:readonly': '1'
        }) + '/>']
      case '文本框':
      case '图表':
      case '智能图形':
      case '嵌入对象':
      case '不可得':
        // 未建模:回写时由"整段原样保留"覆盖,这里不输出
        return []
      case '修订区':
        return [
          缩(深度) + `<w:${块.修改类型 === '新增' ? 'ins' : 'del'}` + 属性串({
            'w:author': 块.作者,
            'w:date': 块.时间
          }) + '>',
          ...this.写块们(块.块, 深度 + 1),
          缩(深度) + `</w:${块.修改类型 === '新增' ? 'ins' : 'del'}>`
        ]
      default:
        return [缩(深度) + '<w:unknown' + 属性串({ 'w:type': 块.类型 }) + '/>']
    }
  }

  写段落 (块, 深度) {
    const 只读 = this.是因为只读(块)
    const 属性 = {
      'w:pStyle': 块.样式名 || undefined,
      'w:jc': 块.版式?.对齐,
      'w:ind-left': 长度.从缇(块.版式?.缩进?.左),
      'w:ind-right': 长度.从缇(块.版式?.缩进?.右),
      'w:ind-firstLine': 长度.从缇(块.版式?.缩进?.首行),
      'w:ind-hanging': 长度.从缇(块.版式?.缩进?.悬挂),
      'w:spacing-line': 块.版式?.行距?.行 ? 行距.从(块.版式.行距.行, 块.版式.行距.规则) : undefined,
      'w:spacing-before': 长度.从缇(块.版式?.行距?.段前),
      'w:spacing-after': 长度.从缇(块.版式?.行距?.段后),
      'w:pageBreakBefore': 块.版式?.分页前 ? '1' : undefined,
      'w:keepNext': 块.版式?.与下段同页 ? '1' : undefined,
      'w:numId': 块.类型 === '列表' ? 块.版式?.编号?.numId : undefined,
      'w:ilvl': 块.类型 === '列表' ? String(块.版式?.编号?.ilvl ?? 0) : undefined,
      'w:listLabel': 块.类型 === '列表' ? 块.标签 : undefined,
      'w:frame-drop': 块.版式?.框架?.下沉,
      'w:frame-lines': 块.版式?.框架?.行数 ? String(块.版式.框架.行数) : undefined,
      'w:anchor': 块.锚?.路径,
      'w:readonly': 只读 ? '1' : undefined
    }

    const 行 = [缩(深度) + '<w:p' + 属性串(属性) + '>']
    if (只读) {
      // 只读段落:文字照样给出来(便于阅读),回写时按 w:anchor 整段搬回
      const 文本 = 块.片段.map(f => f.文本 ?? f.latex ?? `〔${f.种类}〕`).join('')
      if (文本) 行.push(缩(深度 + 1) + `<w:r><w:t>${转义(文本)}</w:t></w:r>`)
    } else {
      行.push(...this.写行内(块.片段, 深度 + 1))
    }
    行.push(缩(深度) + '</w:p>')
    return 行
  }

  写行内 (片段, 深度) {
    const 行 = []
    let 缓冲 = null
    let 当前链接 = null
    const 缩进 = 缩(深度)
    const 关链 = () => {
      冲出缓冲()
      if (当前链接) { 行.push(`${缩进}</w:hyperlink>`); 当前链接 = null }
    }
    const 开链 = (目标) => {
      关链()
      if (目标) {
        行.push(`${缩进}<w:hyperlink w:target="${转义(目标)}">`)
        当前链接 = 目标
      }
    }
    const 冲出缓冲 = () => {
      if (缓冲) { 行.push(this.写文本run(缓冲, 深度 + (当前链接 ? 1 : 0))); 缓冲 = null }
    }

    for (const f of 片段) {
      if (f.种类 === '文本') {
        if ((f.链接 || null) !== 当前链接) 开链(f.链接 || null)
        if (缓冲 && 同格式(缓冲, f)) { 缓冲 = { ...缓冲, 文本: 缓冲.文本 + f.文本 }; continue }
        冲出缓冲()
        缓冲 = { ...f }
        continue
      }
      关链()
      行.push(...this.写行内对象(f, 深度))
    }
    关链()
    return 行
  }

  写文本run (f, 深度) {
    const 属性 = 行内属性(f)
    if (!f.文本) return ''
    return 缩(深度) + `<w:r${属性}>` + `<w:t>${转义(f.文本)}</w:t>` + '</w:r>'
  }

  写行内对象 (f, 深度) {
    const 缩进 = 缩(深度)
    switch (f.种类) {
      case '图片':
        return [缩进 + '<w:r><w:drawing' + 图片属性(f) + '/></w:r>']
      case '公式':
        return [缩进 + `<w:r><m:oMath w:latex="${转义(f.latex)}"` +
          (f.独立 ? ' w:display="1"' : '') + ' w:readonly="1"/></w:r>']
      case '脚注引用':
        return [缩进 + `<w:r><w:${f.注型 === '尾注' ? 'endnoteRef' : 'footnoteRef'}` +
          ` w:id="${转义(String(f.注id ?? f.标号))}" w:label="${转义(String(f.标号))}"/></w:r>`]
      case '控件':
        return [缩进 + '<w:r><w:sdt' + 属性串({
          'w:type': f.控件类型,
          'w:label': f.标签,
          'w:value': f.值,
          'w:checked': f.已勾选 === undefined ? undefined : (f.已勾选 ? '1' : '0'),
          'w:options': f.可选项?.join('|'),
          'w:readonly': '1'
        }) + '/></w:r>']
      case '不可得':
        return [缩进 + `<w:r><w:unavailable w:reason="${转义(f.原因)}"` +
          (f.原值 ? ` w:cached="${转义(f.原值)}"` : '') + '/></w:r>']
      default:
        return [缩进 + `<w:r><w:unknown w:kind="${转义(f.种类)}"/></w:r>`]
    }
  }

  写表格 (块, 深度) {
    const 属性 = {
      'w:style': 块.题注 || undefined,
      'w:jc': 块.对齐,
      'w:cols': 块.列数 ? String(块.列数) : undefined,
      'w:grid': 块.列宽?.map(缇 => 长度.从缇(缇)).join(','),
      'w:caption': 块.题注 || undefined,
      'w:description': 块.说明 || undefined,
      'w:anchor': 块.锚?.路径
    }
    const 行 = [缩(深度) + '<w:tbl' + 属性串(属性) + '>']
    for (const 行项 of 块.行) {
      行.push(缩(深度 + 1) + '<w:tr' + 属性串({
        'w:header': 行项.表头 ? '1' : undefined,
        'w:height': 长度.从缇(行项.高),
        'w:heightRule': 行项.高规则
      }) + '>')
      for (const 格 of 行项.格) {
        if (格.纵向 === '延续') continue
        行.push(缩(深度 + 2) + '<w:tc' + 属性串({
          'w:gridSpan': 格.跨列 > 1 ? String(格.跨列) : undefined,
          'w:vMerge': 格.纵向 === '起' ? 'restart' : undefined,
          'w:width': 长度.从缇(格.宽),
          'w:shading': 格.底纹?.填充 ? 颜色.从(格.底纹.填充) : undefined
        }) + '>')
        行.push(...this.写块们(格.块, 深度 + 3))
        行.push(缩(深度 + 2) + '</w:tc>')
      }
      行.push(缩(深度 + 1) + '</w:tr>')
    }
    行.push(缩(深度) + '</w:tbl>')
    return 行
  }

  写页眉页脚 (块, 深度) {
    const 标签 = 块.位置 === '页眉' ? 'w:hdr' : 'w:ftr'
    return [
      缩(深度) + `<${标签}` + 属性串({
        'w:scope': 块.作用域,
        'w:part': 块.部件,
        'w:anchor': 块.锚?.路径
      }) + '>',
      ...this.写块们(块.块, 深度 + 1),
      缩(深度) + `</${标签}>`
    ]
  }

  写注释区 (块, 深度) {
    const 标签 = 块.注型 === '脚注' ? 'w:footnotes' : 'w:endnotes'
    const 行 = [缩(深度) + `<${标签}>`]
    for (const 项 of 块.项) {
      行.push(缩(深度 + 1) + '<w:note' + 属性串({ 'w:label': String(项.标号), 'w:id': 项.id }) + '>')
      行.push(...this.写块们(项.块, 深度 + 2))
      行.push(缩(深度 + 1) + '</w:note>')
    }
    行.push(缩(深度) + `</${标签}>`)
    return 行
  }

  写批注区 (块, 深度) {
    const 行 = [缩(深度) + '<w:comments>']
    for (const 项 of 块.项) {
      行.push(缩(深度 + 1) + '<w:comment' + 属性串({
        'w:id': 项.id,
        'w:author': 项.作者,
        'w:date': 项.时间,
        'w:replyTo': 项.回复于,
        'w:done': 项.已解决 ? '1' : undefined,
        'w:readonly': 项.回复于 ? '1' : undefined
      }) + '>')
      行.push(...this.写块们(项.块, 深度 + 2))
      行.push(缩(深度 + 1) + '</w:comment>')
    }
    行.push(缩(深度) + '</w:comments>')
    return 行
  }

  /** 这个块里有没有"未建模"的东西 → 整块只读 */
  是因为只读 (块) {
    if (块.含未建模) return true
    const 片段 = 块.片段 || []
    return 片段.some(f => 只读种类.has(f.种类) || f.种类 === '公式')
  }
}

/** 行内文本的属性(扁平化 + 人话) */
function 行内属性 (f) {
  return 属性串({
    'w:rStyle': f.字符样式,
    'w:b': f.粗体 ? '1' : undefined,
    'w:i': f.斜体 ? '1' : undefined,
    'w:vanish': f.隐藏 ? '1' : undefined,
    'w:u': f.下划线 ? (f.下划线类型 || 'single') : undefined,
    'w:strike': f.删除线 ? '1' : undefined,
    'w:vertAlign': f.上标 ? 'superscript' : (f.下标 ? 'subscript' : undefined),
    'w:sz': f.字号 ? 字号.从半磅(Number(f.字号) * 2) : undefined,
    'w:color': f.颜色 ? 颜色.从(f.颜色) : undefined,
    'w:font': f.字体,
    'w:highlight': f.高亮,
    'w:shd': f.底纹 ? 颜色.从(f.底纹) : undefined,
    'w:spacing': f.字符版式?.字间距 ? `${f.字符版式.字间距 / 20}pt` : undefined,
    'w:scale': f.字符版式?.缩放 ? `${f.字符版式.缩放}%` : undefined,
    'w:position': f.字符版式?.升降 ? `${f.字符版式.升降 / 2}pt` : undefined,
    'w:caps': f.字符版式?.全大写 ? '1' : undefined,
    'w:em': f.字符版式?.着重号
  })
}

/** 图片:所有信息都成人话属性 */
function 图片属性 (f) {
  const 定位 = f.定位 || {}
  return 属性串({
    'w:kind': 定位.方式 || 'inline',
    'w:src': f.媒体部件,
    'w:path': f.路径,
    'w:alt': f.替代文字,
    'w:width': f.宽 ? 长度.从EMU(f.宽 * 9525) : undefined,
    'w:height': f.高 ? 长度.从EMU(f.高 * 9525) : undefined,
    'w:posH': 定位.方式 === 'anchor' ? [定位.相对H, 定位.偏移H ? 长度.从EMU(定位.偏移H) : '', 定位.对齐H].filter(Boolean).join('@') : undefined,
    'w:posV': 定位.方式 === 'anchor' ? [定位.相对V, 定位.偏移V ? 长度.从EMU(定位.偏移V) : '', 定位.对齐V].filter(Boolean).join('@') : undefined,
    'w:wrap': 定位.环绕,
    'w:behindDoc': 定位.在文字下方 ? '1' : undefined,
    'w:locked': 定位.锁定锚点 ? '1' : undefined,
    'w:crop': f.裁剪 ? [f.裁剪.左, f.裁剪.上, f.裁剪.右, f.裁剪.下].map(百分比.从).map(v => v || 0).join('%/') + '%' : undefined,
    'w:rotate': f.变换?.旋转 ? `${角度.从(f.变换.旋转)}deg` : undefined,
    'w:flipH': f.变换?.水平翻转 ? '1' : undefined,
    'w:flipV': f.变换?.垂直翻转 ? '1' : undefined,
    'w:anchor': f.锚?.路径
  })
}

/** 两个文本片段的格式是否一致(合并 run 用) */
function 同格式 (a, b) {
  const 键 = ['粗体', '斜体', '删除线', '上标', '下标', '下划线', '下划线类型',
    '字号', '颜色', '字体', '高亮', '底纹', '字符样式']
  return 键.every(k => (a[k] ?? null) === (b[k] ?? null)) &&
    JSON.stringify(a.字符版式 ?? null) === JSON.stringify(b.字符版式 ?? null)
}

/** 拼属性:值为 undefined/null/空串就跳过 */
function 属性串 (对象) {
  const 部分 = []
  for (const [键, 值] of Object.entries(对象)) {
    if (值 === undefined || 值 === null || 值 === '') continue
    部分.push(`${键}="${转义(String(值))}"`)
  }
  return 部分.length ? ' ' + 部分.join(' ') : ''
}

/** XML 转义 */
export function 转义 (s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function 缩 (深度) {
  return '  '.repeat(深度)
}
