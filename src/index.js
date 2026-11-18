/**
 * dshm-tools-docx —— 喵生态的 doc 转换器(读 + 编辑 + 回写)。
 *
 * 两个工具:
 * - `doc_convert`:docx → `<项目>/.dshm/docx/<名>-<sha8>[-样式][-编辑]/` 下的
 *   `content.md` + `chapters/` + `media/` + `index.md` + `manifest.json`
 *   (可编辑版再加 `content.xml` + `raw/原文档.docx`);
 * - `doc_build`:`content.xml` + `raw/` → docx。
 *
 * 模块图见 `doc/doc转换器-模块设计.md`;能力清单见 `doc/元素-可读可编辑可写-总表.md`。
 */

import { docConvertTool } from './tools/convert.js'
import { docBuildTool } from './tools/build.js'

/** 插件名(与包名一致,loader 诊断用) */
export const name = 'dshm-tools-docx'

/** 需要工具注册表 */
export const inject = ['tools']

/**
 * @param {any} ctx
 */
export function apply (ctx) {
  for (const 定义 of [docConvertTool(), docBuildTool()]) {
    ctx.effect(() => ctx.tools.register(定义), `dshm-tools-docx: tool ${定义.name}`)
  }
}

// 供宿主/测试直接复用底层能力(不依赖 dsh)
export { 转换 } from './pipeline.js'
export { 回写器 } from './edit/build.js'
export { 序列化器 } from './edit/writer.js'
export { OoxmlPackage, DocError } from './ooxml/package.js'
export { 解析Xml } from './ooxml/xml.js'
export { 打开Zip } from './ooxml/zip.js'
export { ZipWriter } from './ooxml/zip-write.js'
export { 文档解析器 } from './word/document.js'
export { 公式转换 } from './math/omml.js'
export { 渲染块 } from './output/markdown/index.js'
export { 产物存储 } from './store.js'
export { 项目产物根, 壳子产物根, 产物目录名 } from './paths.js'
// 拓展插件:非 docx 输入 → docx 规范化(自带 LibreOffice 引擎)
export { 判定输入, 规范化为docx, 嗅探容器 } from './import/office.js'
// PDF:先分类再决定(文本型 → pdf2docx 还原版式;图片型 → 明确拒绝)
export { 分类PDF, 探测pdf2docx, 规范化为docx_PDF } from './import/pdf.js'
// PDF 解析器注册表(当前只启用 pdf2docx;其余实验实现见 .test/,不参与发布)
export { 解析器表, 解析器名们, 解析器清单, 取解析器 } from './import/parsers.js'
export { 找Python, 跑Python } from './import/python.js'
