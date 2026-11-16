/**
 * 第二把工具:`doc_build` —— 把"可编辑产物"回写成 docx。
 *
 * 只有真的需要交付文件时才用;日常阅读用 `doc_convert` 就够。
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { 回写器 } from '../edit/build.js'
import { 解析工作区 } from '../workspace.js'

const 参数 = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dir: {
      type: 'string',
      description: '可编辑产物目录(含 content.xml 与 raw/原文档.docx),即 doc_convert 传 styles/edit 时返回的 outDir。'
    },
    out: {
      type: 'string',
      description: '输出 docx 路径;省略则写到该产物目录下的 `重建.docx`。'
    }
  },
  required: ['dir']
}

const 输出schema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    outFile: { type: 'string', description: '写出的 docx 绝对路径' },
    bytes: { type: 'integer', description: '文件字节数' },
    hint: { type: 'string' }
  },
  required: ['outFile', 'bytes']
}

export function docBuildTool () {
  return {
    name: 'doc_build',
    description:
      '把**可编辑产物**(`content.xml` + `raw/`)回写成 docx。\n' +
      '规则:普通段落/表格/图片按你改过的 content.xml 重建;标了 `w:readonly="1"` 的块(含图表、SmartArt、OLE、文本框、页码域、批注等的段落)' +
      '按锚点从 `raw/原文档.docx` 原样搬回 —— 它们改了不生效,但内容不会丢。\n' +
      '先用 `doc_convert` 带 `edit: true` 产出可编辑目录,改完 content.xml 再调本工具。',
    parameters: 参数,
    output: { schema: 输出schema, render: (_a, 值) => [{ type: 'text', text: 渲染结果(值) }] },
    isConcurrencySafe: () => true,
    async execute (args) {
      const 工作区 = 解析工作区()
      const 目录参数 = String(args.dir || '').trim()
      if (!目录参数) throw new Error('dir 不能为空')

      const 目录 = isAbsolute(目录参数)
        ? 目录参数
        : resolve(工作区 || process.cwd(), 目录参数)

      const 内容xml路径 = join(目录, 'content.xml')
      const raw路径 = join(目录, 'raw', '原文档.docx')
      if (!existsSync(内容xml路径)) throw new Error(`这个目录里没有 content.xml:${内容xml路径}(先用 doc_convert 带 edit:true)`)
      if (!existsSync(raw路径)) throw new Error(`这个目录里没有 raw/原文档.docx:${raw路径}`)

      const 字节 = new 回写器({ raw: raw路径, 内容xml: readFileSync(内容xml路径, 'utf8') }).造()

      const 输出 = args.out
        ? (isAbsolute(args.out) ? args.out : resolve(目录, args.out))
        : join(目录, '重建.docx')
      mkdirSync(dirname(输出), { recursive: true })
      writeFileSync(输出, 字节)

      return {
        outFile: 输出,
        bytes: 字节.length,
        hint: '可直接用 Word/WPS 打开;若提示修复,多半是某个只读块在 raw 里找不到原文,把 content.xml 里对应的 w:readonly 去掉再试。'
      }
    }
  }
}

function 渲染结果 (值) {
  return [
    `回写完成:${值.outFile}`,
    `大小:${(值.bytes / 1024).toFixed(1)} KB`,
    `提示:${值.hint}`,
    '查看提醒:正式文档(论文/报告)请用**页面视图**打开 —— 若显示成一张拉不完的长纸,切一下 `视图 → 页面视图`。' +
      '视图模式是读者端的设置,文件里不替用户改。'
  ].join('\n')
}
