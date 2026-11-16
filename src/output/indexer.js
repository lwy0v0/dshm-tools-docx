/**
 * index.md:摘要与导航。模型**先读这个**,再决定读哪一章、看哪张图。
 */

/**
 * @param {object} 参数
 * @returns {string[]}
 */
export function 生成索引 ({
  源文件, 源大小, sha256, 产物根, 转换时间, 统计, 不可得,
  章节, 资源, 文档属性, 选项, 样式类表 = []
}) {
  const 行 = []
  行.push(`# 索引:${文档属性?.标题 || 源文件.split(/[\\/]/).pop()}`)
  行.push('')
  行.push(`- 产物根:**${产物根}**`)
  行.push(`- 源文件:${源文件}(${格式大小(源大小)},sha256 ${sha256.slice(0, 16)}…)`)
  行.push(`- 转换时间:${转换时间}`)
  行.push(`- 统计:${统计行(统计)}`)
  if (不可得.length) 行.push(`- 不可得:${不可得.map(x => x.原因).join('、')}`)
  if (选项.导出图片 === false) 行.push('- 注意:本次未导出图片(`导出图片=false`)')
  if (选项.带样式) {
    行.push(`- 模式:**带样式**(非默认的字号/颜色/字体/高亮/底纹/下划线会标出来)`)
    if (样式类表.length) {
      行.push(`- 样式表:\`styles.md\`(**${样式类表.length} 个类**;出现 ≥2 次的声明才收成类,正文用 \`〔s1〕\` 引用)`)
      行.push(`- 最常用的几类:${样式类表.slice(0, 6).map(x => `\`${x.类}\`=${x.声明}(${x.次数})`).join(' · ')}`)
    } else {
      行.push('- 样式表:本文件样式各不相同,没有可收成类的重复声明;正文里直接写 `〔样式:…〕`')
    }
  } else {
    行.push('- 模式:纯文本(不含颜色/字号等格式;**要格式就读带样式版本**,那是一份独立产物)')
  }
  行.push('')

  if (文档属性 && Object.keys(文档属性).length) {
    行.push('## 文档属性')
    行.push('')
    for (const [k, v] of Object.entries(文档属性)) {
      if (v !== undefined && v !== null && v !== '') 行.push(`- ${k}:${v}`)
    }
    行.push('')
  }

  if (章节.length) {
    行.push('## 大纲')
    行.push('')
    行.push('| 章 | 文件 | 行数 |')
    行.push('| --- | --- | --- |')
    for (const c of 章节) {
      行.push(`| ${转义表(c.标题)} | ${c.文件名} | ${c.行.length} |`)
    }
    行.push('')
  }

  行.push('## 怎么读')
  行.push('')
  行.push(`- 找某句话:\`grep\` 搜 \`${'content.md'}\``)
  行.push('- 按章读:`read chapters/NN-xxx.md`(每章 ≤ 800 行,一次能读完)')
  if (资源.图片.length) 行.push(`- 看某张图:\`read_image ${产物根.replace(/\\/g, '/')}/media/001.png\` 这种绝对路径`)
  行.push('- 只看目录/属性:就是本文件')
  行.push('')

  if (资源.图片.length) {
    行.push('## 图片清单')
    行.push('')
    行.push('| 路径 | 尺寸 | 类型 | 替代文字 |')
    行.push('| --- | --- | --- | --- |')
    for (const 图 of 资源.图片) {
      行.push(`| ${图.相对路径} | ${图.宽 && 图.高 ? `${图.宽}x${图.高}` : ''} | ${图.类型} | ${转义表(图.替代文字 || '')} |`)
    }
    行.push('')
  }

  if (资源.表格.length) {
    行.push('## 表格清单')
    行.push('')
    for (const t of 资源.表格) 行.push(`- ${t}`)
    行.push('')
  }

  if (资源.图表.length) {
    行.push('## 图表清单')
    行.push('')
    for (const t of 资源.图表) 行.push(`- ${t}`)
    行.push('')
  }

  if (资源.公式.length) {
    行.push(`## 公式(共 ${资源.公式.length} 个,以下前 20)`)
    行.push('')
    for (const f of 资源.公式.slice(0, 20)) 行.push(`- \`${f}\``)
    行.push('')
  }

  if (资源.书签.length) {
    行.push('## 书签')
    行.push('')
    行.push(资源.书签.map(b => `\`${b}\``).join('、'))
    行.push('')
  }

  if (不可得.length) {
    行.push('## 不可得(读不到的东西)')
    行.push('')
    for (const x of 不可得) 行.push(`- ${x.原因}${x.原值 ? `(原值"${x.原值}")` : ''}${x.提示 ? ` —— ${x.提示}` : ''}`)
    行.push('')
  }

  return 行
}

function 统计行 (s) {
  const 部分 = [
    `段落 ${s.段落}`,
    `标题 ${s.标题}`,
    `表格 ${s.表格}${s.表格行 ? `(${s.表格行} 行)` : ''}`,
    `图片 ${s.图片}`,
    `公式 ${s.公式}`,
    `脚注 ${s.脚注}`,
    `批注 ${s.批注}`,
    `修订 ${s.修订}`,
    `控件 ${s.控件}`,
    `分节 ${s.分节}`
  ]
  return 部分.join(' · ')
}

function 格式大小 (字节) {
  if (字节 < 1024) return `${字节} B`
  if (字节 < 1024 * 1024) return `${(字节 / 1024).toFixed(1)} KB`
  return `${(字节 / 1024 / 1024).toFixed(2)} MB`
}

function 转义表 (s) {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')
}
