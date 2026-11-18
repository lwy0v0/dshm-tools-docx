/**
 * 唯一的对外工具:`doc_convert`。
 *
 * 只做三件事:校验参数、调 `转换()`、把结果写成模型读得懂的短文本。
 */

import { isAbsolute, resolve } from 'node:path'
import { 转换 } from '../pipeline.js'
import { 解析工作区 } from '../workspace.js'
import { 解析器名们, 解析器清单 } from '../import/parsers.js'

const 参数 = {
  type: 'object',
  additionalProperties: false,
  properties: {
    file: {
      type: 'string',
      description: '文档的绝对路径(相对路径按会话工作区解析)。支持 .docx / .doc / .odt / .pdf:' +
        '.doc 与 .odt 用内置 LibreOffice 引擎规范化;.pdf 会先分类,只有文本型(直接保存的)能转,' +
        '扫描件会明确报"需要 OCR"。PDF 需要 Python 依赖(pymupdf4llm 或 pdf2docx)。'
    },
    parser: {
      type: 'string',
      enum: 解析器名们(),
      description: 'PDF 解析器(仅 .pdf 生效)。当前只有 `pdf2docx`:按 PDF 原始坐标还原版式、保留图片,' +
        '字体不做完全匹配。产物目录名会带解析器标识(如 `-pdf2docx`),以后加/换解析器时可并存对比。'
    },
    project: {
      type: 'string',
      description: '项目根目录:产物会落到 <project>/.dshm/tools/doc/ 下。省略则用当前会话工作区。'
    },
    force: {
      type: 'boolean',
      description: '忽略缓存,强制重新解析(源文件没变也重转)。默认 false。'
    },
    images: {
      type: 'boolean',
      description: '是否把文档里的图片导出成文件(默认 true)。关掉只留占位文字。'
    },
    split: {
      type: 'boolean',
      description: '是否按章拆分 chapters/(默认 true)。大文档建议保持开启。'
    },
    styles: {
      type: 'boolean',
      description: '是否输出**带样式**版本(默认 false):非默认的字号、颜色、字体、高亮、底纹、下划线会写成 ' +
        '`〔样式:14pt #C00000 宋体〕` 这样的前缀,粗/斜/删除线仍用 Markdown 标记。' +
        '带样式版本是独立产物(目录名多一个 `-样式` 后缀),与纯文本版并存,互不覆盖。'
    },
    edit: {
      type: 'boolean',
      description: '是否输出**可编辑**版本(默认 false):额外产出 `content.xml`(元素名=OOXML 元素名、属性扁平化、值写人话)' +
        '与 `raw/原文档.docx` 母版;改完 content.xml 后用 `doc_build` 回写成 docx。目录名多一个 `-编辑` 后缀。'
    }
  },
  required: ['file']
}

const 输出schema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    outDir: { type: 'string', description: '产物目录绝对路径' },
    index: { type: 'string', description: 'index.md 绝对路径(建议先读它)' },
    content: { type: 'string', description: 'content.md 绝对路径' },
    stats: { type: 'object', description: '各类内容计数' },
    missing: { type: 'array', items: { type: 'string' }, description: '读不到的东西' },
    chapters: { type: 'integer', description: '拆出的章节数' },
    parser: { type: ['string', 'null'], description: '实际使用的解析器名(如 pymupdf4llm / pdf2docx / libreoffice-kit);原生 docx 为 null' },
    styled: { type: 'boolean', description: '本次产物是否是带样式版本' },
    editable: { type: 'boolean', description: '本次产物是否含可编辑视图(content.xml)' },
    imported: {
      type: ['object', 'null'],
      description: '非 docx 输入的规范化信息(原始格式/引擎/缺字体);原生 docx 为 null'
    },
    cached: { type: 'boolean', description: '是否命中缓存(没重新解析)' }
  },
  required: ['outDir', 'index', 'content', 'stats', 'cached']
}

export function docConvertTool () {
  return {
    name: 'doc_convert',
    description:
      '把 .docx 解析成**一个文件夹**(正文 md + 图片附件 + 索引),放在项目的 .dshm/tools/doc/ 下,之后用 read / grep / glob / read_image 按需阅读。\n' +
      '它比"一次性把全文塞进上下文"省得多:一次调用只回一份索引摘要,读多少由你决定。\n' +
      '能转文本的全都转文本(标题层级、列表、表格含合并、OMML 公式→LaTeX、脚注尾注、批注、修订、域缓存、文本框、图表数据、SmartArt 文字、页眉页脚、文档属性);' +
      '转不成的(位图、EMF/WMF 矢量、OLE 对象)导出成 media/ 下的文件,由你决定要不要 read_image。\n' +
      '读不到的东西(页码、自动分页、浮动坐标)会在产物里标成 〔不可得:…〕,不会静默丢掉。\n' +
      '`.doc`(Word 97-2003)与 `.odt` 可以直接给:内部会先用自带的 LibreOffice 引擎规范化成 docx 再解析,不需要你手动另存。',
    parameters: 参数,
    output: { schema: 输出schema, render: (_args, 值) => [{ type: 'text', text: 渲染结果(值) }] },
    isConcurrencySafe: () => true,
    async execute (args) {
      const 文件参数 = String(args.file || '').trim()
      if (!文件参数) throw new Error('file 不能为空')

      const 工作区 = args.project ? String(args.project) : 解析工作区()
      const 项目根 = 工作区 ? (isAbsolute(工作区) ? 工作区 : resolve(工作区)) : null
      if (!项目根) {
        throw new Error('拿不到项目目录:请在 project 参数里显式给出项目根路径')
      }

      const 文件 = isAbsolute(文件参数) ? 文件参数 : resolve(项目根, 文件参数)

      const 结果 = await 转换({
        文件,
        项目根,
        强制: args.force === true,
        导出图片: args.images !== false,
        拆章: args.split !== false,
        带样式: args.styles === true,
        可编辑: args.edit === true,
        PDF解析器: args.parser === 'pymupdf4llm' ? 'pymupdf4llm' : 'pdf2docx'
      })

      return {
        outDir: 结果.产物根,
        index: 结果.索引,
        content: 结果.全文,
        stats: 结果.统计,
        missing: 结果.不可得,
        chapters: 结果.章节数,
        parser: 结果.规范化?.引擎 || null,
        styled: args.styles === true,
        editable: args.edit === true,
        imported: 结果.规范化 || null,
        cached: 结果.命中缓存
      }
    }
  }
}

/** 返回给模型看的短摘要 */
function 渲染结果 (值) {
  const s = 值.stats || {}
  const 行 = []
  行.push(值.cached ? '已存在同源文件的产物(命中缓存,未重新解析)。' : '转换完成。')
  if (值.imported) {
    const 缺 = 值.imported.缺失字体
    const 引擎 = 值.imported.引擎 || 值.parser || '外部引擎'
    行.push(
      `解析器:【${引擎}】—— 输入 ${值.imported.原始格式} 由它规范化成 docx 后再解析` +
      (缺 && 缺.length ? `;缺字体:${缺.join('、')}(未知字体已回落默认字形)` : '') + '。'
    )
    行.push(`(产物目录名已带解析器标识,换解析器不会覆盖本目录,可直接与其它解析器的产物并排对比)`)
  }
  行.push(`产物目录:${值.outDir}`)
  行.push(`先读索引:${值.index}`)
  行.push(`全文:${值.content}${值.chapters ? `,按章:${值.chapters} 个文件在 chapters/` : ''}`)
  行.push(`模式:${值.styled ? '带样式(颜色/字号/字体等标成 〔样式:…〕)' : '纯文本(要格式请再调一次 styles=true)'}`)
  行.push(
    `统计:段落 ${s.段落 ?? 0} · 标题 ${s.标题 ?? 0} · 表格 ${s.表格 ?? 0} · 图片 ${s.图片 ?? 0} · ` +
    `公式 ${s.公式 ?? 0} · 脚注 ${s.脚注 ?? 0} · 批注 ${s.批注 ?? 0} · 修订 ${s.修订 ?? 0}`
  )
  if (值.missing && 值.missing.length) 行.push(`读不到:${值.missing.join('、')}`)
  行.push('下一步:read 索引看大纲;要正文就按章 read chapters/,或 grep content.md;要看图 read_image 绝对路径。')
  return 行.join('\n')
}

export { 参数 }
