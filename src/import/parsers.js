/**
 * PDF 解析器注册表。
 *
 * **目前只启用 `pdf2docx`** —— 实测下来它是唯一真正"还原版式"且保留图片的方案:
 * 按 PDF 里的原始坐标把段落位置、图片、表格摆回 docx,字体只做回落处理。
 *
 * 另外几家的实验实现(均已可跑通,但效果或定位不合用)移到了插件的 `.test/` 下保留,不参与发布:
 * - `pymupdf4llm`:只取文本层再重排 —— 不是还原;
 * - `docling`:版面理解最准(标题/分章),但只输出 md,docx 仍是重排;
 * - `docling-layout`:用 docling 的 bbox 做近似定位,视觉最接近,但页数会膨胀、图片取不到。
 *
 * 想恢复某一家:把 `.test/parsers/<名>.js` 与 `.test/scripts/` 下对应的 py 移回,
 * 并在下面的表里登记一条即可 —— 目录名会自动带解析器标识,与 pdf2docx 的产物并存。
 */

import { 规范化为docx_PDF } from './pdf.js'

/**
 * @typedef {{
 *   名: string,
 *   策略: '还原版式'|'重新排版',
 *   说明: string,
 *   依赖: string,
 *   产出: string,
 *   转: (参数: {输入:string, docx输出:string, md输出?:string, 超时?:number}) => Promise<object>
 * }} 解析器定义
 */

/** @type {Record<string, 解析器定义>} */
export const 解析器表 = {
  pdf2docx: {
    名: 'pdf2docx',
    策略: '还原版式',
    说明: '按 PDF 里的原始坐标还原段落/图片/表格位置,力求贴近原文档。' +
      '字体不做完全匹配 —— 缺失字形回落默认字体。',
    依赖: 'pip install pdf2docx',
    产出: 'docx(版式还原,含图片)',
    转: async ({ 输入, docx输出, 超时, 公式区域 }) =>
      规范化为docx_PDF({ 输入, 输出: docx输出, 超时, 公式区域 })
  }
}

/** 可用的解析器名(供工具参数 enum 使用) */
export function 解析器名们 () {
  return Object.keys(解析器表)
}

/** 每个解析器的简介,用于报错与文档 */
export function 解析器清单 () {
  return Object.values(解析器表).map(p => `- ${p.名}(${p.策略}):${p.说明}`).join('\n')
}

/**
 * 取一个解析器;不存在就报清楚有哪些可选。
 * @param {string} 名
 */
export function 取解析器 (名) {
  const 定义 = 解析器表[名]
  if (!定义) {
    const 可选 = Object.keys(解析器表).join(' / ')
    throw new Error(`未知的 PDF 解析器「${名}」。可选:${可选}\n${解析器清单()}`)
  }
  return 定义
}
