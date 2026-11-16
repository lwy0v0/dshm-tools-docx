/**
 * 图片:行内图、浮动图、VML 老图、`mc:AlternateContent` 双份(SVG/PNG)。
 *
 * 只负责"图从哪来、多大、替代文字是什么";
 * 摆在哪、怎么翻、裁了多少,归 `../drawing.js`;图表/SmartArt/OLE 归 `embed.js`。
 */

import { A, V, WP, MC } from '../../ooxml/ns.js'
import { 找后代 } from '../../ooxml/xml.js'
import { 图形定位, 图形变换, 图形裁剪 } from '../drawing.js'

export { 找后代, 找所有后代 } from '../../ooxml/xml.js'

const EMU_PER_PX = 9525

/**
 * 解析一个 `w:drawing` / `w:pict` 节点里的图片。
 * @returns {object|null}
 */
export function 解析图片 (节点, 上下文) {
  // 兼容内容:优先取 Fallback(通常是 PNG,read_image 认得)
  let 体 = 节点
  const 兼容 = 找后代(节点, 'AlternateContent', MC)
  if (兼容) {
    const 回退 = 兼容.找('Fallback', MC)
    const 首选 = 兼容.找('Choice', MC)
    体 = (回退 && 找后代(回退, 'blip', A)) ? 回退 : (首选 || 兼容)
  }

  // DrawingML 图片
  const blip = 找后代(体, 'blip', A)
  if (blip) return 解析Blip(blip, 体, 节点, 上下文)

  // VML 老式图片
  const 图像 = 找后代(体, 'imagedata', V)
  if (图像) return 解析Vml(图像, 节点, 上下文)

  return null
}

/** DrawingML 图片 */
function 解析Blip (blip, 体, 原始节点, 上下文) {
  const 嵌入 = blip.属性('embed')
  const 链接 = blip.属性('link')
  const rid = 嵌入 || 链接
  const 关系 = rid ? 上下文.关系目标(rid) : null
  const 尺寸 = 读尺寸(体)
  const docPr = 找后代(体, 'docPr', WP)
  const 替代文字 = docPr?.属性('descr') || docPr?.属性('title') || ''
  const 浮动 = !!找后代(体, 'anchor', WP)

  if (!关系) {
    return {
      种类: '图片',
      路径: null,
      替代文字,
      宽: 尺寸.宽,
      高: 尺寸.高,
      浮动,
      格式: '',
      位置: 链接 ? '外链图片(未随文档提供)' : '',
      定位: 图形定位.读(体),
      锚: 上下文.锚(原始节点)
    }
  }

  const 信息 = 上下文.导出媒体(关系.目标)
  上下文.登记图片(信息, { 宽: 尺寸.宽, 高: 尺寸.高, 替代文字, 浮动 })

  const 裁剪 = 图形裁剪.读(体)
  const 变换 = 图形变换.读(体)

  return {
    种类: '图片',
    路径: 信息 ? 信息.相对路径 : null,
    替代文字,
    宽: 尺寸.宽,
    高: 尺寸.高,
    浮动,
    格式: 信息 ? 信息.类型 : '',
    位置: 关系.外部 ? '外链图片(未随文档提供)' : '',
    媒体部件: 关系.目标,
    定位: 图形定位.读(体),
    ...(裁剪 ? { 裁剪 } : {}),
    ...(变换 ? { 变换 } : {}),
    锚: 上下文.锚(原始节点)
  }
}

/** VML 老图:`v:imagedata` + 形状 style 里的宽高 */
function 解析Vml (图像, 原始节点, 上下文) {
  const rid = 图像.属性('id')
  const 关系 = rid ? 上下文.关系目标(rid) : null
  const 信息 = 关系 ? 上下文.导出媒体(关系.目标) : null

  return {
    种类: '图片',
    路径: 信息 ? 信息.相对路径 : null,
    替代文字: 图像.属性('title') || '',
    宽: 读样式长度(图像, 'width'),
    高: 读样式长度(图像, 'height'),
    浮动: false,
    格式: 信息 ? 信息.类型 : '',
    位置: 关系 ? '' : 'VML 图片引用丢失',
    媒体部件: 关系?.目标 || null,
    定位: { 方式: 'vml' },
    锚: 上下文.锚(原始节点)
  }
}

/** 画布尺寸(EMU → px) */
function 读尺寸 (体) {
  const 范围 = 找后代(体, 'extent', WP)
  if (!范围) return { 宽: null, 高: null }
  const cx = Number(范围.属性('cx'))
  const cy = Number(范围.属性('cy'))
  return {
    宽: Number.isFinite(cx) && cx > 0 ? Math.round(cx / EMU_PER_PX) : null,
    高: Number.isFinite(cy) && cy > 0 ? Math.round(cy / EMU_PER_PX) : null
  }
}

/** 从 VML 的 style 属性里读宽度(mm/pt/px/in)→ px */
function 读样式长度 (节点, 键) {
  const 样式 = 节点.父?.属性('style') || 节点.属性('style') || ''
  const m = new RegExp(`${键}:([0-9.]+)(pt|px|mm|in)`).exec(样式)
  if (!m) return null
  const 值 = Number(m[1])
  const 单位 = m[2]
  const px = 单位 === 'pt' ? 值 * 96 / 72 : 单位 === 'mm' ? 值 * 96 / 25.4 : 单位 === 'in' ? 值 * 96 : 值
  return Math.round(px)
}
