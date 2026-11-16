/**
 * dshm-tools-doc —— 喵生态的 doc 转换器(读 + 编辑 + 回写)。
 *
 * 两个工具:
 * - `doc_convert`:docx → `<项目>/.dshm/doc/<名>-<sha8>[-样式][-编辑]/` 下的
 *   `content.md` + `chapters/` + `media/` + `index.md` + `manifest.json`
 *   (可编辑版再加 `content.xml` + `raw/原文档.docx`);
 * - `doc_build`:`content.xml` + `raw/` → docx。
 *
 * 模块图见 `doc/doc转换器-模块设计.md`;能力清单见 `doc/元素-可读可编辑可写-总表.md`。
 */

import { docConvertTool } from './tools/convert.js'
import { docBuildTool } from './tools/build.js'

/** 插件名(与包名一致,loader 诊断用) */
export const name = 'dshm-tools-doc'

/** 需要工具注册表 */
export const inject = ['tools']

/**
 * @param {any} ctx
 */
export function apply (ctx) {
  for (const 定义 of [docConvertTool(), docBuildTool()]) {
    ctx.effect(() => ctx.tools.register(定义), `dshm-tools-doc: tool ${定义.name}`)
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
