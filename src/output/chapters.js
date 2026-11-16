/**
 * 拆章:大文档不能塞成一次 `read`。
 *
 * `read` 默认 2000 行 / 50KB 就截断,所以每章按 **800 行** 切,保证一次能吃完。
 */

/**
 * 把块按标题分组。
 * @param {object[]} 块们
 * @param {number} 级别 按哪一级标题分章(1 = 一级标题)
 * @returns {{标题:string, 块:object[]}[]}
 */
export function 按标题分组 (块们, 级别 = 1) {
  const 组 = []
  let 当前 = { 标题: '', 块: [] }
  for (const 块 of 块们) {
    if (块.类型 === '标题' && 块.级别 <= 级别) {
      if (当前.块.length || 当前.标题) 组.push(当前)
      当前 = { 标题: 块.片段.map(f => f.文本 || '').join('').trim(), 块: [块] }
    } else {
      当前.块.push(块)
    }
  }
  if (当前.块.length || 当前.标题) 组.push(当前)
  return 组
}

/**
 * 排版成"每章一个文件"的结果。
 * @param {object[]} 块们
 * @param {(块:object[], 选项?:object) => string[]} 渲染 渲染函数(返回行数组)
 * @param {{最大行数?:number}} [选项]
 * @returns {{章节: {标题:string, 文件名:string, 行:string[]}[], 全文: string[]}}
 */
export function 拆章 (块们, 渲染, 选项 = {}) {
  const 最大行数 = 选项.最大行数 ?? 800
  const 全文行 = 渲染(块们)
  const 一级 = 按标题分组(块们, 1)

  const 章节 = []
  let 序号 = 0
  for (const 组 of 一级) {
    let 行 = 渲染(组.块)
    if (组.标题) 行 = [`# ${组.标题}`, '', ...行.filter(l => !(l.startsWith('# ') && l.includes(组.标题)))]
    // 太长再按二级标题切
    if (行.length > 最大行数) {
      const 子组 = 按标题分组(组.块, 2)
      for (const 子 of 子组) {
        if (!子.块.length) continue
        章节.push({
          标题: 子.标题 || 组.标题 || `第${++序号}节`,
          文件名: `chapters/${String(++序号).padStart(2, '0')}-${安全名(子.标题 || 组.标题 || 'section')}.md`,
          行: 渲染(子.块)
        })
      }
      continue
    }
    章节.push({
      标题: 组.标题 || '全文',
      文件名: `chapters/${String(++序号).padStart(2, '0')}-${安全名(组.标题 || 'section')}.md`,
      行
    })
  }

  return { 章节, 全文: 全文行 }
}

/** 文件名安全化(保留中文) */
export function 安全名 (s) {
  const 干净 = String(s).replace(/[\\/:*?"<>|\r\n\t]/g, '').replace(/\s+/g, '_').trim()
  const 截断 = 干净.slice(0, 40)
  return 截断 || 'section'
}
