/**
 * 编排:打开包 → 解析 → 渲染 → 落盘 → 清单。
 *
 * 只做"顺序"和"错误处理",不做任何解析或格式化细节。
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OoxmlPackage, DocError } from './ooxml/package.js'
import { WordContext } from './word/context.js'
import { 文档解析器 } from './word/document.js'
import { 读文档属性 } from './word/props.js'
import { 产品目录, 版本 } from './version.js'
import { 媒体导出器 } from './output/media.js'
import { 渲染块 } from './output/markdown/index.js'
import { 拆章 } from './output/chapters.js'
import { 扫描样式类, 定型, 建样式表行 } from './output/stylemap.js'
import { 生成索引 } from './output/indexer.js'
import { 生成清单, 产物版本 } from './output/manifest.js'
import { 产物存储 } from './store.js'
import { 序列化器 } from './edit/writer.js'

/**
 * 转换一份 doc。
 *
 * @param {object} 参数
 * @param {string} 参数.文件 docx 绝对路径
 * @param {string} [参数.项目根] 项目根(产物落 `.dshm/tools/doc/`)
 * @param {string} [参数.存储根] 直接指定存储根(与项目根二选一)
 * @param {boolean} [参数.强制] 忽略缓存
 * @param {boolean} [参数.导出图片] 默认 true
 * @param {boolean} [参数.拆章] 默认自动
 * @returns {Promise<object>}
 */
export async function 转换 (参数) {
  const {
    文件,
    项目根,
    存储根,
    强制 = false,
    导出图片 = true,
    拆章: 要不要拆 = true,
    带样式 = false,
    可编辑 = false
  } = 参数

  if (!文件) throw new DocError('缺少参数:文件', 'EINVAL')
  if (!existsSync(文件)) throw new DocError(`文件不存在:${文件}`, 'ENOENT')
  if (!/\.docx$/i.test(文件)) {
    const 是doc = /\.doc$/i.test(文件)
    throw new DocError(
      是doc
        ? `这是 .doc(Word 97-2003)二进制格式,本转换器不解析 —— 请用 Word 另存为 .docx 后重试:${文件}`
        : `只支持 .docx(Office 2007+),当前文件:${文件}`,
      'UNSUPPORTED'
    )
  }

  const 选项 = { 导出图片, 拆章: 要不要拆, 带样式, 可编辑 }
  const 存储 = new 产物存储({ 项目根, 存储根 })
  const 指纹 = 产物存储.指纹(文件)
  const 目录 = 存储.目录(文件, 指纹.sha256, 选项)

  if (!强制) {
    const 旧 = 存储.命中(目录, { sha256: 指纹.sha256, 版本, 选项 })
    if (旧) return 摘要(旧, 目录, true)
  }

  const 包 = OoxmlPackage.打开文件(文件)
  const 主文档 = 包.主文档路径()

  存储.准备(目录)
  const 媒体 = new 媒体导出器({ 包, 目录: join(目录, 'media') })
  const 上下文 = new WordContext({ 包, 主文档, 选项, 媒体 })
  const 结果 = new 文档解析器(上下文).解析()

  const 文档属性 = 读文档属性(包)
  const 转换时间 = new Date().toISOString()

  // 样式类:先扫一遍计数,把重复声明收成 s1、s2…(只出现一次的留在正文写全)
  const 样式类 = 带样式
    ? 定型(扫描样式类(结果.块))
    : null
  const 渲染选项 = { ...选项, 样式类: 样式类?.映射 }

  /** 渲染一批块;带样式时在顶部附一张"本批用到的类" */
  const 渲染一批 = (块们) => {
    const 行 = 渲染块(块们, 渲染选项)
    if (!样式类 || !样式类.表.length) return 行
    const 局部 = 扫描样式类(块们)
    const 用到 = 样式类.表.filter(x => 局部.has(x.声明) && 样式类.映射.get(x.声明))
      .map(x => ({ ...x, 次数: 局部.get(x.声明) }))
    if (!用到.length) return 行
    return [
      ...建样式表行(用到, {
        标题: '样式表(本文件用到的类)',
        说明: '类号在整份产物里一致;全表见 `styles.md`,读法:`〔s1〕` = 该处文字用该类格式。'
      }),
      ...行
    ]
  }

  // 正文与拆章
  const 章节结果 = 要不要拆
    ? 拆章(结果.块, 渲染一批)
    : { 章节: [], 全文: 渲染一批(结果.块) }

  const 内容行 = 章节结果.全文
  const 索引行 = 生成索引({
    源文件: 文件,
    源大小: 指纹.大小,
    sha256: 指纹.sha256,
    产物根: 目录,
    转换时间,
    统计: 结果.统计,
    不可得: 结果.不可得,
    章节: 章节结果.章节,
    资源: 结果.资源,
    文档属性,
    选项,
    样式类表: 样式类?.表 || []
  })

  const 清单 = 生成清单({
    源文件: 文件,
    源大小: 指纹.大小,
    源mtime: 指纹.mtime,
    sha256: 指纹.sha256,
    产物根: 目录,
    转换时间,
    统计: 结果.统计,
    不可得: 结果.不可得,
    章节: 章节结果.章节,
    资源: 结果.资源,
    文档属性,
    选项,
    版本
  })

  // 落盘
  存储.写(目录, 'content.md', [
    `<!-- ${产品目录} ${版本} · 源 ${文件.split(/[\\/]/).pop()} · ${转换时间} -->`,
    '',
    ...内容行
  ].join('\n'))
  存储.写(目录, 'index.md', 索引行.join('\n'))
  存储.写(目录, 'manifest.json', JSON.stringify(清单, null, 2))
  for (const 章 of 章节结果.章节) 存储.写(目录, 章.文件名, 章.行.join('\n'))
  if (样式类 && 样式类.表.length) {
    存储.写(目录, 'styles.md', [
      '# 样式表',
      '',
      `共 ${样式类.表.length} 个类(出现 ≥2 次的样式声明才收成类,只出现一次的写在正文里)。`,
      '类号按出现次数降序:s1 用得最多。',
      '',
      '| 类 | 声明 | 次数 |',
      '| --- | --- | --- |',
      ...样式类.表.map(x => `| ${x.类} | ${x.声明} | ${x.次数} |`),
      ''
    ].join('\n'))
  }
  if (可编辑) {
    const 序列化器实例 = new 序列化器()
    存储.写(目录, 'content.xml', 序列化器实例.序列化(结果, {
      源: 文件.split(/[\\/]/).pop(),
      sha: 指纹.sha256,
      版本,
      转换时间
    }))
    // raw/ 母版:整份原文档原样留一份,回写时按锚点取原文
    存储.写二进制(目录, join('raw', '原文档.docx'), readFileSync(文件))
  }

  return 摘要(清单, 目录, false)
}

/** 组装返回给模型的摘要(尽量短) */
function 摘要 (清单, 目录, 命中) {
  return {
    产物根: 目录.replace(/\\/g, '/'),
    索引: join(目录, 'index.md').replace(/\\/g, '/'),
    全文: join(目录, 'content.md').replace(/\\/g, '/'),
    统计: 清单.统计,
    不可得: (清单.不可得 || []).map(x => x.原因),
    章节数: 清单.产物?.章节?.length || 0,
    命中缓存: 命中,
    产物版本
  }
}

export { 产物版本 }
