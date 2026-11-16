/**
 * manifest.json:产物自己的"身份证明"。
 *
 * 作用只有一个:**下次调用能判断这份产物还能不能用**(源文件指纹 + 转换器版本 + 选项)。
 */

export const 产物版本 = 1
export const 转换器名 = 'dshm-tools-doc'

/**
 * @returns {object}
 */
export function 生成清单 ({
  源文件, 源大小, 源mtime, sha256, 产物根, 转换时间,
  统计, 不可得, 章节, 资源, 文档属性, 选项, 版本
}) {
  return {
    产物版本,
    转换器: `${转换器名}@${版本}`,
    转换时间,
    源: {
      路径: 源文件,
      大小: 源大小,
      mtime: 源mtime,
      sha256
    },
    产物: {
      根: 产物根,
      索引: 'index.md',
      全文: 'content.md',
      章节目录: 'chapters',
      媒体目录: 'media',
      章节: 章节.map(c => ({ 标题: c.标题, 文件: c.文件名, 行数: c.行.length }))
    },
    统计,
    不可得,
    选项,
    文档属性,
    资源: {
      图片: 资源.图片.map(x => ({ 路径: x.相对路径, 宽: x.宽, 高: x.高, 类型: x.类型, 替代文字: x.替代文字 })),
      公式数: 资源.公式.length,
      图表数: 资源.图表.length,
      表格数: 资源.表格.length,
      书签: 资源.书签
    }
  }
}

/** 缓存命中判断 */
export function 可用 (旧清单, { sha256, 版本, 选项 }) {
  if (!旧清单) return false
  if (旧清单.产物版本 !== 产物版本) return false
  if (旧清单.转换器 !== `${转换器名}@${版本}`) return false
  if (旧清单.源?.sha256 !== sha256) return false
  if (!!旧清单.选项?.导出图片 !== !!选项.导出图片) return false
  if (!!旧清单.选项?.带样式 !== !!选项.带样式) return false
  return true
}
