/**
 * 样式表:把重复的样式声明收成"类"(像 CSS)。
 *
 * 问题:带样式模式里 `〔样式:14pt #365F91 Ubuntu〕` 这种前缀会在几十处重复,正文又长又吵。
 * 办法:同一份声明只写一次 —— 正文用 `〔s1〕` 这样的短类名,声明集中放进 `styles.md`,
 * 并在 `content.md` / 每个分章文件顶部放一张"本文件用到的类"小表。
 *
 * 规则:
 * - 出现 **≥2 次** 的声明才收成类(只出现一次的留在正文里写全,免得表比正文还长);
 * - 类号按**出现次数降序**编号(`s1` 最常用),同频时按首次出现顺序,保证结果稳定可复现。
 */

/** 递归收集所有块里的样式声明(声明 → 次数) */
export function 扫描样式类 (块们, 出 = new Map()) {
  for (const 块 of 块们) 扫块(块, 出)
  return 出
}

function 扫块 (块, 出) {
  if (!块 || typeof 块 !== 'object') return
  if (块.片段) 扫片段(块.片段, 出)
  // 嵌套块:文本框 / 修订区 / 页眉页脚
  if (Array.isArray(块.块)) 扫块组(块.块, 出)
  // 表格:逐格
  if (块.类型 === '表格' && Array.isArray(块.行)) {
    for (const 行项 of 块.行) for (const 格 of 行项.格) 扫块组(格.块, 出)
  }
  // 注释区 / 批注区
  if (Array.isArray(块.项)) for (const 项 of 块.项) 扫块组(项.块, 出)
}

function 扫块组 (块组, 出) {
  for (const 块 of 块组) 扫块(块, 出)
}

function 扫片段 (片段, 出) {
  for (const f of 片段) {
    if (f.种类 !== '文本') continue
    const 声明 = 样式声明(f)
    if (!声明) continue
    出.set(声明, (出.get(声明) || 0) + 1)
  }
}

/**
 * 从片段取出"非默认格式"的声明串(与 markdown 输出完全一致)。
 * 放在这里而不是 markdown 里,是为了扫描与渲染用同一份规则 —— 两边一旦分叉,类名就会错位。
 */
export function 样式声明 (f) {
  const 部分 = []
  const 色 = (v) => (v && !v.startsWith('#') ? `#${v}` : v)
  if (f.字号) 部分.push(`${f.字号}pt`)
  if (f.颜色) 部分.push(色(f.颜色))
  if (f.字体) 部分.push(f.字体)
  if (f.高亮) 部分.push(`高亮:${f.高亮}`)
  if (f.底纹) 部分.push(`底纹:${色(f.底纹)}`)
  if (f.下划线类型) 部分.push(`下划线:${f.下划线类型}`)
  else if (f.下划线) 部分.push('下划线')
  return 部分.join(' ')
}

/**
 * 把计数定成类表。
 * @param {Map<string, number>} 计数
 * @param {number} [最少次数] 低于它不收成类
 * @returns {{映射: Map<string,string>, 表: {类:string, 声明:string, 次数:number}[]}}
 */
export function 定型 (计数, 最少次数 = 2) {
  const 候选 = [...计数.entries()].filter(([, 次]) => 次 >= 最少次数)
  // 次数降序;同频按首次出现顺序(靠 计数 的插入顺序)
  const 顺序 = new Map([...计数.keys()].map((k, i) => [k, i]))
  候选.sort((a, b) => (b[1] - a[1]) || (顺序.get(a[0]) - 顺序.get(b[0])))

  const 映射 = new Map()
  const 表 = []
  候选.forEach(([声明, 次数], i) => {
    const 类 = `s${i + 1}`
    映射.set(声明, 类)
    表.push({ 类, 声明, 次数 })
  })
  return { 映射, 表 }
}

/** Markdown 表格行(表头 + 若干行) */
export function 建样式表行 (项, { 标题 = '样式表', 说明 = '' } = {}) {
  if (!项.length) return []
  const 行 = [`## ${标题}`, '']
  if (说明) 行.push(说明, '')
  行.push('| 类 | 声明 | 次数 |')
  行.push('| --- | --- | --- |')
  for (const x of 项) 行.push(`| ${x.类} | ${x.声明} | ${x.次数} |`)
  行.push('')
  return 行
}
