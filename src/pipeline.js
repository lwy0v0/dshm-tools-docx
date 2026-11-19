/**
 * 编排:打开包 → 解析 → 渲染 → 落盘 → 清单。
 *
 * 只做"顺序"和"错误处理",不做任何解析或格式化细节。
 */

import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { OoxmlPackage, DocError } from './ooxml/package.js'
import { 判定输入, 规范化为docx } from './import/office.js'
import { 分类PDF } from './import/pdf.js'
import { 取解析器, 解析器名们, 解析器清单 } from './import/parsers.js'
import { 提取公式图, 公式OCR } from './import/formula.js'
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
    可编辑 = false,
    转换超时 = 120_000,
    PDF解析器 = 'pdf2docx'
  } = 参数

  if (!文件) throw new DocError('缺少参数:文件', 'EINVAL')
  if (!existsSync(文件)) throw new DocError(`文件不存在:${文件}`, 'ENOENT')
  if (!解析器名们().includes(PDF解析器)) {
    throw new DocError(
      `未知的 PDF 解析器「${PDF解析器}」。可选:${解析器名们().join(' / ')}\n${解析器清单()}`,
      'EINVAL'
    )
  }

  // 按魔数判定,不信后缀:`.doc` 改名成 `.docx`、RTF 冒充 `.doc` 都在这里拦下
  const 判定 = 判定输入(文件)
  if (判定.不支持) throw new DocError(判定.不支持, 'UNSUPPORTED')

  // 解析器名要进目录名:同一份 PDF 换个解析器就换一个目录,产物才能并排对比
  const 解析器名 = !判定.需要规范化
    ? ''
    : 判定.格式 === 'pdf'
      ? PDF解析器
      : 'libreoffice'

  const 选项 = { 导出图片, 拆章: 要不要拆, 带样式, 可编辑, 解析器: 解析器名 }
  const 存储 = new 产物存储({ 项目根, 存储根 })
  const 指纹 = 产物存储.指纹(文件)
  const 目录 = 存储.目录(文件, 指纹.sha256, 选项)

  if (!强制) {
    const 旧 = 存储.命中(目录, { sha256: 指纹.sha256, 版本, 选项 })
    if (旧) return 摘要(旧, 目录, true)
  }

  // 非 docx 先在产物目录里规范化成标准 docx,再走同一条解析链路。
  // 放在缓存检查之后:源文件没变就完全不碰引擎(不用起 LibreOffice / Python)。
  存储.准备(目录)
  let 解析文件 = 文件
  let 规范化 = null
  if (判定.需要规范化) {
    const 中间 = join(目录, '_source.docx')
    try {
      rmSync(中间, { force: true })
    } catch (e) {
      // 产物目录里的 `_source.docx` 正被别的程序打开(Word / WPS / 预览器 / 杀软扫描)。
      // 直接把 EPERM 抛出去只有一行堆栈,看不懂发生了什么 —— 换成能照做的说明。
      if (e && (e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES')) {
        throw new DocError(
          `产物文件被占用,无法覆盖:${中间}\n` +
          '请先关闭正在打开它的程序(Word / WPS / 预览器)再试;' +
          '或者换一个项目根,让产物落到别的目录。',
          'EBUSY'
        )
      }
      throw e
    }
    let 转换结果
    if (判定.格式 === 'pdf') {
      // 先分类:图片型没有文本层,必须 OCR —— 明确拒绝,不假装成功
      const 分类 = 分类PDF(文件)
      if (分类.类型 === 'image') {
        throw new DocError(
          `这是图片型 PDF(扫描件),没有文本层,无法直接转成 docx:${分类.依据}。` +
          '这类文件需要 OCR 才能取到文字,当前尚未支持。',
          'UNSUPPORTED'
        )
      }
      // PDF 转换慢,给足时间(大文档可达数分钟)
      const PDF超时 = Math.max(Number(转换超时), 600_000)
      const 解析器定义 = 取解析器(PDF解析器)
      // 模型缓存必须落在项目内:沙箱下子进程写不了 ~/.cache(HF 默认位置)
      const 模型缓存 = join(存储.根, '..', 'cache', 'huggingface')

      // 公式定位要**排在 pdf2docx 之前**:pdf2docx 没有公式概念,只会把公式
      // 碾成散字、再按间距误判成表格。把定位结果传过去,它会把公式区域渲染成
      // 图片注入,位置尺寸都精确 —— 后续按 1:1 换成 OMML 即可,不用再猜形态。
      // 增强项:任一环失败都不该让整次转换失败。
      let 公式区域 = null
      let 公式图结果 = null
      if (导出图片) {
        try {
          公式图结果 = await 提取公式图({ pdf: 文件, 输出目录: 目录 })
          if (公式图结果.ok && 公式图结果.公式数 > 0) {
            公式区域 = 公式图结果.清单路径
          }
        } catch (e) {
          公式图结果 = {
            ok: false, 公式数: 0, 清单路径: null,
            原因: String(e && e.message ? e.message : e)
          }
        }
      }

      const 解析结果 = await 解析器定义.转({
        输入: 文件,
        docx输出: 中间,
        md输出: join(目录, '_source.md'),
        超时: PDF超时,
        公式区域,
        环境: { HF_HOME: 模型缓存, HF_HUB_CACHE: join(模型缓存, 'hub') }
      })
      转换结果 = {
        ...解析结果,
        公式图: 公式图结果,
        策略: 解析器定义.策略,
        PDF分类: { 类型: 分类.类型, 页数: 分类.页数, 依据: 分类.依据 }
      }

      // 公式识别 + 版式清理(拆"排版容器表格")。两件事互不依赖:公式数为 0 的页
      // (如第 1 页)也要走一趟,否则那里的图注会一直留在格格不入的表格里。
      if (公式图结果?.ok) {
        try {
          转换结果.公式OCR = await 公式OCR({ 产物目录: 目录, docx: 中间 })
        } catch (e) {
          转换结果.公式OCR = {
            ok: false, 识别数: 0, 总数: 0, 写回docx: false,
            原因: String(e && e.message ? e.message : e)
          }
        }
      }
    } else {
      转换结果 = await 规范化为docx({ 输入: 文件, 输出: 中间, timeoutMs: Number(转换超时) })
    }
    规范化 = {
      ...转换结果,
      原始格式: 判定.实际是 || 判定.格式,
      中间文件: '_source.docx'
    }
    解析文件 = 中间
  }

  const 包 = OoxmlPackage.打开文件(解析文件)
  const 主文档 = 包.主文档路径()

  const 媒体 = new 媒体导出器({ 包, 目录: join(目录, 'media') })
  const 上下文 = new WordContext({ 包, 主文档, 选项, 媒体 })
  const 结果 = new 文档解析器(上下文).解析()

  // 规范化是有损的:转换过程丢掉的东西必须进"不可得",不能静默吞掉
  const 不可得 = [...(结果.不可得 || [])]
  if (规范化) {
    不可得.push({
      原因: `由 ${规范化.原始格式} 经 ${规范化.引擎 || '外部引擎'} 规范化成 docx 后解析;` +
        '版式、编号与域可能被重排,原文格式不保证保真'
    })
    if (规范化.缺失字体.length) {
      不可得.push({
        原因: `规范化时缺字体:${规范化.缺失字体.join('、')} —— 对应字形已被替换,可能与原件不同`
      })
    }
    // 公式:pdf2docx 会把它碾成字符,结构必然丢失 —— 说清楚,并指向抠出来的图片
    const 公式图 = 规范化.公式图
    if (公式图 && 公式图.ok && 公式图.公式数 > 0) {
      不可得.push({
        原因: `PDF 里的公式已被 pdf2docx 碾成普通字符,上下标与分式结构丢失;` +
          `已从原 PDF 裁出 ${公式图.公式数} 张公式图放在 media/formulas/(清单 formulas.json),` +
          '要看公式请 read_image 打开对应图片,再按需转成 LaTeX'
      })
    } else if (公式图 && !公式图.ok) {
      不可得.push({ 原因: `公式图提取未完成:${公式图.原因 || '未知原因'}` })
    }
  }

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
    不可得,
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
    不可得,
    章节: 章节结果.章节,
    资源: 结果.资源,
    文档属性,
    选项,
    规范化,
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
    // raw/ 母版:留一份**规范化后**的 docx —— 回写按它取原文,所以必须是真正的 docx
    存储.写二进制(目录, join('raw', '原文档.docx'), readFileSync(解析文件))
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
    规范化: 清单.规范化
      ? {
          原始格式: 清单.规范化.原始格式,
          引擎: 清单.规范化.引擎,
          策略: 清单.规范化.策略,
          后端: 清单.规范化.后端,
          缺失字体: 清单.规范化.缺失字体 || [],
          ...(清单.规范化.PDF分类 ? { PDF分类: 清单.规范化.PDF分类 } : {}),
          公式图: 清单.规范化.公式图 || null,
          公式OCR: 清单.规范化.公式OCR || null
        }
      : null,
    命中缓存: 命中,
    产物版本
  }
}

export { 产物版本 }
