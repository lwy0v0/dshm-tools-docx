/**
 * 单位换算:人话 ↔ OOXML 原生值。
 *
 * 编辑视图里写 `0.5in` / `14pt` / `1.5x` / `#C00000`,这里换算成缇 / 半磅 / 240 倍数。
 * **换算是精确的整数比**,不是近似:没被编辑的属性回写时优先用 raw 里的原值,所以不会累积误差。
 */

/** 长度单位 → 缇(1in = 1440,1pt = 20,1mm = 56.6929…) */
const 长度到缇 = { in: 1440, pt: 20, cm: 1440 / 2.54, mm: 1440 / 25.4, px: 15 }

/** EMU(1in = 914400) */
const 长度到EMU = { in: 914400, pt: 12700, cm: 914400 / 2.54, mm: 914400 / 25.4, px: 9525 }

export class 长度 {
  /** `0.5in` / `12mm` / `36pt` → 缇;纯数字视为缇 */
  static 转缇 (值) {
    if (值 === undefined || 值 === null || 值 === '') return null
    if (typeof 值 === 'number') return Math.round(值)
    const m = /^\s*(-?[0-9.]+)\s*(in|pt|cm|mm|px)?\s*$/i.exec(String(值))
    if (!m) return null
    const 数 = Number(m[1])
    const 单位 = (m[2] || '').toLowerCase()
    if (!单位) return Math.round(数)
    return Math.round(数 * 长度到缇[单位])
  }

  /** 缇 → 人话(自动挑最清楚的单位) */
  static 从缇 (缇) {
    if (!Number.isFinite(缇) || 缇 === 0) return undefined
    if (缇 % 1440 === 0) return `${缇 / 1440}in`
    if (缇 % 20 === 0) return `${缇 / 20}pt`
    return `${Number((缇 / 1440).toFixed(4))}in`
  }

  /** `1.5in` / `300pt` → EMU(图片尺寸与位置用) */
  static 转EMU (值) {
    if (值 === undefined || 值 === null || 值 === '') return null
    if (typeof 值 === 'number') return Math.round(值)
    const m = /^\s*(-?[0-9.]+)\s*(in|pt|cm|mm|px)?\s*$/i.exec(String(值))
    if (!m) return null
    const 数 = Number(m[1])
    const 单位 = (m[2] || 'px').toLowerCase()
    return Math.round(数 * 长度到EMU[单位])
  }

  /** EMU → 人话 */
  static 从EMU (emu) {
    if (!Number.isFinite(emu) || emu === 0) return undefined
    if (emu % 914400 === 0) return `${emu / 914400}in`
    return `${Number((emu / 12700).toFixed(2))}pt`
  }
}

export class 字号 {
  /** `14pt` / `14` → 半磅 */
  static 转半磅 (值) {
    if (值 === undefined || 值 === null || 值 === '') return null
    const m = /^\s*([0-9.]+)\s*(pt)?\s*$/i.exec(String(值))
    if (!m) return null
    return Math.round(Number(m[1]) * 2)
  }

  /** 半磅 → `14pt` */
  static 从半磅 (半磅) {
    if (!Number.isFinite(半磅) || 半磅 === 0) return undefined
    return `${半磅 / 2}pt`
  }
}

export class 行距 {
  /**
   * `1.5x` / `18pt` → { 行, 规则 }
   * - `1.5x`  → 行=360,规则=auto(240 = 单倍)
   * - `18pt` → 行=360,规则=exact
   */
  static 转 (值) {
    if (值 === undefined || 值 === null || 值 === '') return null
    const s = String(值).trim()
    const 倍 = /^([0-9.]+)\s*x$/i.exec(s)
    if (倍) return { 行: Math.round(Number(倍[1]) * 240), 规则: 'auto' }
    const 点 = /^([0-9.]+)\s*pt$/i.exec(s)
    if (点) return { 行: Math.round(Number(点[1]) * 20), 规则: 'exact' }
    const 数 = Number(s)
    return Number.isFinite(数) ? { 行: Math.round(数), 规则: 'auto' } : null
  }

  /** { 行, 规则 } → `1.5x` / `18pt` */
  static 从 (行, 规则 = 'auto') {
    if (!Number.isFinite(行) || 行 === 0) return undefined
    if (规则 === 'auto') {
      const 倍 = 行 / 240
      return `${Number(倍.toFixed(2))}x`
    }
    return `${行 / 20}pt`
  }
}

export class 颜色 {
  /** `#C00000` / `C00000` → `C00000` */
  static 转 (值) {
    if (!值) return null
    return String(值).replace(/^#/, '').toUpperCase()
  }

  /** `C00000` → `#C00000` */
  static 从 (值) {
    if (!值 || 值 === 'auto') return undefined
    return `#${String(值).toUpperCase()}`
  }
}

export class 角度 {
  /** `15` / `15deg` → 1/60000 度 */
  static 转 (值) {
    if (值 === undefined || 值 === null || 值 === '') return null
    const m = /^\s*(-?[0-9.]+)\s*(deg)?\s*$/i.exec(String(值))
    return m ? Math.round(Number(m[1]) * 60000) : null
  }

  static 从 (六万分度) {
    if (!Number.isFinite(六万分度) || 六万分度 === 0) return undefined
    return Number((六万分度 / 60000).toFixed(2))
  }
}

export class 百分比 {
  /** 12.5(%) → 千分比 125 */
  static 转 (值) {
    if (值 === undefined || 值 === null || 值 === '') return null
    const m = /^\s*(-?[0-9.]+)\s*%?\s*$/.exec(String(值))
    return m ? Math.round(Number(m[1]) * 10) : null
  }

  /** 千分比 → 百分比数字 */
  static 从 (千分比) {
    if (!Number.isFinite(千分比) || 千分比 === 0) return undefined
    return 千分比 / 10
  }
}
