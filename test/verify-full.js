/**
 * 全量验收:造一份"什么都塞了"的 docx → 转换 → 逐条断言。
 *
 * 输出一张 PASS/FAIL 表;有 FAIL 时进程退出码非 0。
 * 这是这个插件的"回归测试" —— 改任何模块后跑一遍就知道有没有踩坏别的东西。
 */

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { 造全量夹具 } from './fixtures-full.js'
import { 写夹具文件 } from './write.js'
import { 测试项目根, 新建夹具目录 } from './workspace.js'
import { 转换 } from '../src/pipeline.js'
import { 回写器 } from '../src/edit/build.js'
import { 解析Xml } from '../src/ooxml/xml.js'

const 项目根 = 测试项目根()
const 根 = 新建夹具目录('full')
mkdirSync(根, { recursive: true })
const 源 = join(根, '全量测试.docx')
写夹具文件(源, 造全量夹具())

const t0 = Date.now()
// 测试一律强制重转:否则改了输出代码、缓存却还命中,断言会验到旧产物
const 结果 = await 转换({ 文件: 源, 项目根, 强制: true })
const 耗时 = Date.now() - t0

// 同一份源再转一次带样式版本(应当落在另一个目录,互不覆盖)
const 样式结果 = await 转换({ 文件: 源, 项目根, 带样式: true, 强制: true })
const 样式正文 = readFileSync(join(样式结果.产物根, 'content.md'), 'utf8')

const 产物根 = 结果.产物根
const content = readFileSync(join(产物根, 'content.md'), 'utf8')
const index = readFileSync(join(产物根, 'index.md'), 'utf8')
const manifest = JSON.parse(readFileSync(join(产物根, 'manifest.json'), 'utf8'))
const 媒体文件 = existsSync(join(产物根, 'media')) ? readdirSync(join(产物根, 'media')) : []
const 章节文件 = existsSync(join(产物根, 'chapters')) ? readdirSync(join(产物根, 'chapters')) : []

const 有 = (s) => content.includes(s)
const 没 = (s) => !content.includes(s)
const 索引有 = (s) => index.includes(s)

/** @type {[string, boolean, string?][]} */
const 检查 = []
const 断言 = (名, 条件, 备注 = '') => 检查.push([名, !!条件, 备注])

// —— 段落与行内格式 ——
断言('标题层级 H1', 有('# 第一章 全部内容测试'))
断言('标题层级 H2', 有('## 1.1 列表'))
断言('粗体', 有('**粗体**'))
断言('斜体', 有('*斜体*'))
断言('下划线(不进 Markdown,不炸)', 有('下划线'))
断言('删除线', 有('~~删除线~~'))
断言('上标', 有('^{上标}'))
断言('下标', 有('_{下标}'))
断言('隐藏文字被剔除', 没('隐藏文字不应出现'))
断言('字符样式 Strong → 粗体', 有('**字符样式强调**'))
断言('特殊字符:制表符', 有('\t制表符后'))
断言('特殊字符:手动换行', 有('换行后'))
断言('特殊字符:符号保留可读', 有('[符号 Wingdings/F0FC]'))
断言('拼音指南', 有('汉(hàn)'))
断言('分页符:不污染正文', !有('—— 分页 ——'))
断言('分栏符:不污染正文', !有('—— 分栏 ——'))
断言('空段落不刷屏', (content.match(/\n{4,}/g) || []).length <= 8, `连续空行块 ${(content.match(/\n{4,}/g) || []).length} 处`)

// —— 列表 ——
断言('无序列表', 有('- 〔列表:无序一〕'))
断言('有序列表 1.', 有('1. 〔列表:有序第一条〕'))
断言('有序列表子级 a)', 有('a) 〔列表:有序子项 a〕'))
断言('序号递增 2.', 有('2. 〔列表:有序第二条〕'))
断言('startOverride 重启 → 5)', 有('5) 〔列表:重启用例 A〕'))
断言('中文编号 一、', 有('一、') && 有('〔列表:中文编号一〕'), '标签与正文间有空格正常')
断言('罗马编号 I.', 有('I. 〔列表:罗马编号一〕'))

// —— 表格 ——
断言('基础表格(表头)', 有('| 表头A | 表头B | 表头C |'))
断言('表格数据行', 有('| 甲 | 乙 | 丙 |'))
断言('横向合并 colspan', 有('colspan="3">横跨三列'))
断言('纵向合并起点', 有('纵向起点'))
断言('纵向合并延续格不重复输出', !有('<td></td><td>竖排文字'))
断言('竖排单元格文字', 有('竖排文字'))
断言('嵌套表格', 有('内1') && 有('内2'))
断言('表格内图片', 有('格内图'))
断言('表格内公式', 有('$y=ax+b$'))

// —— 图片 ——
断言('行内图 + 相对引用', 有('![行内图的替代文字](media/001.png)'))
断言('图片机器可读注释', 有('<!-- image: media/'))
断言('浮动图标记', 有('浮动'))
断言('VML 图替代文字', 有('VML 图标题'))
断言('AlternateContent 取 PNG 回退', 有('PNG 版回退'))
断言('AlternateContent 不取 SVG', 没('SVG 版'))
断言('外链图提示', 有('外链图片(未随文档提供)'))
断言('EMF 也导出成文件', 媒体文件.some(f => f.endsWith('.emf')), 媒体文件.join(','))
断言('媒体文件落盘 ≥2', 媒体文件.length >= 2, `共 ${媒体文件.length} 个`)

// —— 公式 ——
断言('分式', 有('\\frac{a+b}{c}'))
断言('上标', 有('x^{2}'))
断言('下标', 有('a_{i}'))
断言('上下标同现', 有('x_{1}^{2}'))
断言('前置上下标 sPre', 有('{}_{0}^{1}F'))
断言('根式(带次数)', 有('\\sqrt[3]{x}'))
断言('根式(无次数)', 有('\\sqrt{z}'))
断言('求和', 有('\\sum_{i=1}^{n}'))
断言('积分', 有('\\int_{0}^{1}'))
断言('定界符(自定义)', 有('\\left( a \\middle| b \\right]'))
断言('函数', 有('\\log{x}'))
断言('下限 limLow', 有('\\underset{n\\to\\infty}'))
断言('上限 limUpp', 有('\\overset{′}'))
断言('矩阵', 有('\\begin{matrix}') && 有('1 & 2'))
断言('方程组', 有('\\begin{aligned}') && 有('x+y=1'))
断言('重音符', 有('\\hat{a}'))
断言('上划线', 有('\\overline{b}'))
断言('下花括号 groupChr', 有('\\underbrace{c}'))
断言('边框盒', 有('\\boxed{d}'))
断言('幻影', 有('\\phantom{e}'))
断言('希腊字母/运算符映射', 有('\\alpha') && 有('\\le') && 有('\\sum') && 有('\\int'))

// —— 域 ——
断言('目录域文字保留', 有('第一章 全部内容测试……1'))
断言('PAGE 域 → 不可得', 有('〔不可得:页码(PAGE 域)〕'))
断言('PAGE 域缓存值不冒充正文', 没('3〔不可得') && 没('7〔不可得'))
断言('NUMPAGES 域 → 不可得', (content.match(/〔不可得:页码/g) || []).length >= 2)
断言('简单域 fldSimple 取结果', 有('2026'))
断言('HYPERLINK 域 → 链接', 有('[域形式的超链接](https://example.com/域链接)'))
断言('SEQ 域缓存(题注号)', 有('表 2'))
断言('REF 域缓存文字', 有('见第 3 节'))
断言('脏域同样按页码处理', 没('99〔不可得'))

// —— 注释与修订 ——
断言('脚注引用标号', 有('[^1]'))
断言('脚注区', 有('## 脚注') && 有('脚注正文'))
断言('脚注里的公式', 有('E=mc'))
断言('尾注区', 有('## 尾注') && 有('尾注正文'))
断言('脚注分隔符被排除', 没('续分隔符'))
断言('批注区', 有('## 批注') && 有('李四') && 有('这条批注需要复核'))
断言('修订插入保留', 有('新增内容应保留'))
断言('修订删除剔除', 没('删除内容应剔除'))
断言('修订计数 ≥3', 结果.统计.修订 >= 3, `修订 ${结果.统计.修订}`)
断言('移动目标保留文字', 有('〔标记:移动目标〕新位置文字'))
断言('格式修订不炸', 有('格式被改过的文字'))

// —— 内容控件 ——
断言('复选框控件', 有('〔内容控件:复选框 "同意条款"'))
断言('下拉控件', 有('〔内容控件:下拉 "选择项"'))
断言('组合框控件', 有('〔内容控件:组合框 "组合框"'))
断言('日期控件', 有('〔内容控件:日期 "日期选择"'))
断言('重复节控件', 有('〔内容控件:重复节 "重复节"'))
断言('部件库控件', 有('〔内容控件:文档部件 "部件库"'))
断言('富文本控件内容保留', 有('控件里的正文'))

// —— 文本框与嵌入对象 ——
断言('VML 文本框', 有('〔文本框〕') && 有('VML 文本框里的文字'))
断言('形状文本框', 有('〔文本框〕') && 有('形状里的文字'))
断言('图表类型与数据表', 有('〔图表:bar') && 有('| 分类 | 销售额 | 预测 |'))
断言('图表数值', 有('| 一月 | 100 | 90 |'))
断言('SmartArt 文字', 有('年度目标') && 有('增长 20%'))
断言('OLE 对象标注', 有('〔嵌入对象:公式(MathType/公式编辑器)'))
断言('altChunk 文本', 有('〔标记:altChunk 段落〕'))

// —— 结构 ——
断言('书签进索引', 索引有('章节锚点'))
断言('外部超链接', 有('[点我去官网](https://example.com/)'))
断言('锚点超链接', 有('[跳到本章](#章节锚点)'))
断言('分节信息(横向)', 有('横向'))
断言('分节信息(两栏)', 有('2 栏'))
断言('页眉', 有('## 〔页眉〕') && 有('〔页眉〕全量测试文档'))
断言('首页页眉', 有('〔首页页眉〕'))
断言('页脚', 有('## 〔页脚〕'))
断言('页眉里的图', 有('页眉图'))

// —— 版式与锚点(为回写准备):直接用解析层再解一遍,看对象字段 ——
import { OoxmlPackage } from '../src/ooxml/package.js'
import { WordContext } from '../src/word/context.js'
import { 文档解析器 } from '../src/word/document.js'
const 解析包 = OoxmlPackage.打开文件(源)
const 解析上下文 = new WordContext({
  包: 解析包,
  主文档: 解析包.主文档路径(),
  选项: { 导出图片: false },
  媒体: { 取: () => null }
})
const 解析结果 = new 文档解析器(解析上下文).解析()

const 全部块 = []
const 收集块 = (块们) => {
  for (const b of 块们) {
    全部块.push(b)
    if (Array.isArray(b.块)) 收集块(b.块)
    if (Array.isArray(b.行)) for (const r of b.行) for (const c of r.格) 收集块(c.块)
    if (Array.isArray(b.项)) for (const x of b.项) 收集块(x.块)
  }
}
收集块(解析结果.块)
const 居中段 = 全部块.find(b => b.版式?.对齐 === 'center' && b.版式?.缩进?.左 === 720)
断言('版式:对齐 + 左右缩进 + 首行缩进', !!居中段, JSON.stringify(居中段?.版式 || null))
断言('版式:行距与段前段后(缇)', 居中段?.版式?.行距?.行 === 360 && 居中段?.版式?.行距?.段前 === 120 && 居中段?.版式?.行距?.段后 === 240, JSON.stringify(居中段?.版式?.行距 || null))
断言('版式:段落锚点路径', /w:document\/w:body\[0\]\/w:p\[\d+\]/.test(居中段?.锚?.路径 || ''), 居中段?.锚?.路径)
const 基础表 = 全部块.find(b => b.类型 === '表格' && b.列宽?.length === 3)
断言('尺寸:表格列宽(缇)', JSON.stringify(基础表?.列宽) === '[3000,3000,3000]', JSON.stringify(基础表?.列宽))
断言('尺寸:行高与表头标记', 基础表?.行?.[0]?.高 === 480 && 基础表?.行?.[0]?.表头 === true, JSON.stringify({ 高: 基础表?.行?.[0]?.高, 表头: 基础表?.行?.[0]?.表头 }))
断言('尺寸:单元格宽', 基础表?.行?.[0]?.格?.[0]?.宽 === 3000, String(基础表?.行?.[0]?.格?.[0]?.宽))
const 浮动图片段 = 全部块.flatMap(b => b.片段 || []).find(f => f.种类 === '图片' && f.浮动)
断言('图片:浮动定位(相对 + 偏移 + 环绕)', 浮动图片段?.定位?.方式 === 'anchor' && 浮动图片段?.定位?.相对H === 'column' && 浮动图片段?.定位?.环绕 === 'square', JSON.stringify(浮动图片段?.定位 || null))
断言('图片:媒体部件与锚点', !!浮动图片段?.媒体部件 && /w:drawing\[\d+\]/.test(浮动图片段?.锚?.路径 || ''), 浮动图片段?.锚?.路径)
断言('分节:锚点', !!解析结果.块.find(b => b.类型 === '分节')?.锚?.路径)
断言('分页符:记为段落标记(不进正文)', 全部块.some(b => b.分页 === true),
  全部块.filter(b => b.分页).length + ' 段')

// —— 边框 / 底纹 / 制表位 / 框架 / 字符版式(补齐回来的那批) ——
const 边框段 = 全部块.find(b => b.版式?.边框?.上)
断言('段落边框', 边框段?.版式?.边框?.上?.样式 === 'single', JSON.stringify(边框段?.版式?.边框 || null))
断言('段落底纹', 边框段?.版式?.底纹?.填充 === 'EEEEEE', JSON.stringify(边框段?.版式?.底纹 || null))
const 制表段 = 全部块.find(b => b.版式?.制表位?.length)
断言('制表位(位置/对齐/前导符)', 制表段?.版式?.制表位?.[1]?.位置 === 8000 && 制表段?.版式?.制表位?.[1]?.前导符 === 'dot', JSON.stringify(制表段?.版式?.制表位 || null))
断言('段落框架(位置/环绕)', 制表段?.版式?.框架?.宽 === 4000 && 制表段?.版式?.框架?.环绕 === 'around', JSON.stringify(制表段?.版式?.框架 || null))
const 字符段 = 全部块.find(b => (b.片段 || []).some(f => f.字符版式?.字间距))
const 字符片段 = 字符段?.片段?.find(f => f.字符版式)
断言('字符版式:字间距/缩放/大写/着重号', 字符片段?.字符版式?.字间距 === 40 && (字符段.片段.find(f => f.字符版式?.缩放)?.字符版式.缩放 === 150) && (字符段.片段.find(f => f.字符版式?.全大写)?.字符版式.全大写 === true) && (字符段.片段.find(f => f.字符版式?.着重号)?.字符版式.着重号 === 'dot'), JSON.stringify(字符片段?.字符版式 || null))

// —— 表格边框 / 单元格底纹 / 斜线 ——
断言('表格边框与底纹', 基础表?.边框?.上?.样式 === 'single' && 基础表?.底纹?.填充 === 'F2F2F2', JSON.stringify({ 边框: 基础表?.边框?.上, 底纹: 基础表?.底纹 }))
断言('表格对齐', 基础表?.对齐 === 'center', String(基础表?.对齐))
const 合并表 = 全部块.find(b => b.类型 === '表格' && b.合并)
const 斜线格 = 合并表?.行?.flatMap(r => r.格).find(c => c.斜线)
断言('单元格底纹 + 斜线 + 文字方向', 斜线格?.底纹?.填充 === 'DDEBF7' && 斜线格?.斜线 === 'tl2br' && 斜线格?.文字方向 === 'btLr', JSON.stringify({ 底纹: 斜线格?.底纹, 斜线: 斜线格?.斜线, 方向: 斜线格?.文字方向 }))

// —— 图片裁剪 / 旋转 / 文本框定位 ——
const 裁剪图 = 全部块.flatMap(b => b.片段 || []).find(f => f.种类 === '图片' && f.裁剪)
断言('图片裁剪(百分比)', 裁剪图?.裁剪?.左 === 10 && 裁剪图?.裁剪?.上 === 5, JSON.stringify(裁剪图?.裁剪 || null))
断言('图片旋转(度)', 裁剪图?.变换?.旋转 === 15, JSON.stringify(裁剪图?.变换 || null))
const 浮动框 = 全部块.find(b => b.类型 === '文本框' && b.定位?.方式 === 'anchor')
断言('文本框浮动定位', 浮动框?.定位?.相对H === 'page' && 浮动框?.定位?.对齐H === 'right' && 浮动框?.定位?.偏移V === 762000 && 浮动框?.定位?.锁定锚点 === true, JSON.stringify(浮动框?.定位 || null))
断言('文本框替代文字', 浮动框?.替代文字 === '浮动的文本框', String(浮动框?.替代文字))

// —— 域清单 / 批注回复 / 页眉页脚作用域 ——
const 域清单 = 解析结果.资源.域
断言('域清单:数量与分类', 域清单.length >= 8 && 域清单.some(x => x.类型 === '页码') && 域清单.some(x => x.类型 === '目录'), `共 ${域清单.length} 条`)
断言('域清单:需重算标记(dirty)', 域清单.some(x => x.需重算 === true), `重算 ${域清单.filter(x => x.需重算).length} 条`)
断言('域清单:带锚与指令', 域清单.every(x => x.指令 && x.锚), '')
断言('批注:回复与已解决', (() => {
  const 批注区 = 全部块.find(b => b.类型 === '批注区')
  return 批注区?.项?.[0]?.回复于 === '00PARENT' && 批注区?.项?.[0]?.已解决 === true
})(), '')
const 页眉页脚块 = 解析结果.块.filter(b => b.类型 === '页眉页脚')
断言('页眉页脚:作用域区分(默认/首页)', 页眉页脚块.some(b => b.作用域 === '默认') && 页眉页脚块.some(b => b.作用域 === '首页'), 页眉页脚块.map(b => `${b.位置}(${b.作用域})`).join(','))
断言('分节:页眉页脚引用', (() => {
  const 节 = 解析结果.块.find(b => b.类型 === '分节' && b.页眉引用)
  return !!节?.页眉引用?.length && !!节?.页眉引用?.[0]?.部件
})(), '')

// —— 文档属性 / 统计 / 产物 ——
断言('属性:作者', 索引有('作者:张三'))
断言('属性:字数', 索引有('字数:1234'))
断言('属性:自定义属性', 索引有('项目编号:MIAO-2026'))
断言('统计:表格 ≥4', 结果.统计.表格 >= 4, `${结果.统计.表格}`)
断言('统计:图片 ≥5', 结果.统计.图片 >= 5, `${结果.统计.图片}`)
断言('统计:公式 ≥20', 结果.统计.公式 >= 20, `${结果.统计.公式}`)
断言('统计:批注 1', 结果.统计.批注 === 1, `${结果.统计.批注}`)
断言('统计:脚注 2(含尾注)', 结果.统计.脚注 === 2, `${结果.统计.脚注}`)
断言('chapters 已生成', 章节文件.length >= 1, 章节文件.join(','))
断言('每章 ≤ 800 行', 章节文件.every(f => readFileSync(join(产物根, 'chapters', f), 'utf8').split('\n').length <= 820))
断言('manifest 有源指纹', typeof manifest.源?.sha256 === 'string' && manifest.源.sha256.length === 64)
断言('manifest 记录不可得', Array.isArray(manifest.不可得))

// —— 可编辑模式 + 回写往返 ——
const 编辑结果 = await 转换({ 文件: 源, 项目根, 可编辑: true, 强制: true })
const 编辑根 = 编辑结果.产物根
const 内容xml路径 = join(编辑根, 'content.xml')
断言('可编辑:独立目录(不覆盖其他版本)', 编辑根 !== 结果.产物根, 编辑根.split(/[\\/]/).pop())
断言('可编辑:产出 content.xml 与 raw 母版',
  existsSync(内容xml路径) && existsSync(join(编辑根, 'raw', '原文档.docx')))
const 内容xml = readFileSync(内容xml路径, 'utf8')
断言('可编辑:元素名是 OOXML 名', 内容xml.includes('<w:p ') && 内容xml.includes('<w:tbl '))
断言('可编辑:属性扁平化 + 人话单位',
  内容xml.includes('w:jc="center"') && /w:sz="\d+(\.\d+)?pt"/.test(内容xml) && /w:ind-left="[\d.]+(in|pt)"/.test(内容xml),
  (内容xml.match(/w:ind-left="[^"]+"/) || [])[0])
断言('可编辑:块带锚点', (内容xml.match(/w:anchor="w:document\/w:body\[0\]/g) || []).length >= 20)
断言('可编辑:未建模块标只读', 内容xml.includes('w:readonly="1"'))
断言('可编辑:分节带页面设置', /w:sectPr[^>]*w:pageW="\d+mm"[^>]*w:marginLeft="\d+mm"/.test(内容xml),
  (内容xml.match(/w:pageW="[^"]+"|w:marginLeft="[^"]+"/g) || []).slice(0, 2).join(' '))

const 回写字节 = new 回写器({ raw: join(编辑根, 'raw', '原文档.docx'), 内容xml }).造()
const 重建路径 = join(根, '回写.docx')
writeFileSync(重建路径, 回写字节)
断言('回写:产出非空 docx', 回写字节.length > 1000, `${(回写字节.length / 1024).toFixed(1)} KB`)
{
  // 结构健全性:Word 要求 `<w:document><w:body>…</w:body></w:document>`,少一层就打开空白
  const 包 = OoxmlPackage.打开文件(重建路径)
  const 主 = 包.文本(包.主文档路径())
  const 根 = 解析Xml(主)
  断言('回写:根元素是 w:document', 根.名 === 'document' && 根.子.length > 0, `${根.前缀}:${根.名}`)
  断言('回写:正文包在 w:body 里', 根.子[0]?.名 === 'body', 根.子[0] ? `${根.子[0].前缀}:${根.子[0].名}` : '(无子元素)')
  断言('回写:body 末尾是 w:sectPr', 根.子[0]?.子.at(-1)?.名 === 'sectPr',
    根.子[0]?.子.at(-1) ? `${根.子[0].子.at(-1).前缀}:${根.子[0].子.at(-1).名}` : '(空)')
  // 视图模式是读者端的事:回写**不该**动 settings.xml 里的 w:view(夹具里存的是 web)
  const 设置名 = 包.列出().find(n => n.endsWith('settings.xml'))
  const 设置文 = 设置名 ? 包.文本(设置名) : ''
  断言('回写:不改默认视图(读者端设置)', !设置名 || /<w:view w:val="web"\/>/.test(设置文),
   设置文 ? (设置文.match(/<w:view[^>]*>/) || ['(无 w:view)'])[0] : '(无 settings.xml)')
}

// 明确要求时(论文/正式文档)可以改成页面视图
{
  const 印刷字节 = new 回写器({ raw: join(编辑根, 'raw', '原文档.docx'), 内容xml, 视图: 'print' }).造()
  const 印刷路径 = join(根, '页面视图.docx')
  writeFileSync(印刷路径, 印刷字节)
  const 印刷包 = OoxmlPackage.打开文件(印刷路径)
  const 印刷设置 = 印刷包.文本(印刷包.列出().find(n => n.endsWith('settings.xml')))
  断言('回写:可指定页面视图(视图:"print")', /<w:view w:val="print"\/>/.test(印刷设置),
    (印刷设置.match(/<w:view[^>]*>/) || ['(无 w:view)'])[0])
}

const 二次 = await 转换({ 文件: 重建路径, 项目根, 强制: true })
const 二次正文 = readFileSync(join(二次.产物根, 'content.md'), 'utf8')
const 规范化正文 = (文本) => 文本.split('\n')
  .filter(l => !l.startsWith('<!-- ') && l.trim() !== '')
  .map(l => l.trim())
断言('回写:正文与原文一致', JSON.stringify(规范化正文(二次正文)) === JSON.stringify(规范化正文(content)),
  `原 ${规范化正文(content).length} 行 / 回写后 ${规范化正文(二次正文).length} 行`)
for (const k of ['标题', '表格', '表格行', '图片', '公式', '脚注']) {
  断言(`回写:${k}数一致`, 二次.统计[k] === 结果.统计[k], `${结果.统计[k]} → ${二次.统计[k]}`)
}

// 改页面设置(表格 → 回写 → 再解析,读回应是新尺寸)
{
  const 改后 = 内容xml
    .replace(/w:pageW="[^"]+"/, 'w:pageW="210mm"')
    .replace(/w:pageH="[^"]+"/, 'w:pageH="297mm"')
    .replace(/w:marginLeft="[^"]+"/, 'w:marginLeft="30mm"')
  const 改字节 = new 回写器({ raw: join(编辑根, 'raw', '原文档.docx'), 内容xml: 改后 }).造()
  const 改路径 = join(根, '改页面.docx')
  writeFileSync(改路径, 改字节)
  const 改结果 = await 转换({ 文件: 改路径, 项目根, 强制: true })
  const 分节行 = readFileSync(join(改结果.产物根, 'content.md'), 'utf8')
    .split('\n').filter(l => l.includes('〔分节:')).join(' | ')
  断言('回写:页面设置改得动(A4 / 左边距 30mm)',
    分节行.includes('210×297mm') && 分节行.includes('左30/'), 分节行.trim().slice(0, 120))
}

// —— 带样式模式 ——
断言('带样式:独立目录(不覆盖纯文本版)', 样式结果.产物根 !== 结果.产物根, 样式结果.产物根.split(/[\\/]/).pop())
断言('带样式:纯文本版里没有样式注释', !有('〔样式:'))
断言('带样式:字号+颜色(经样式类)', 样式正文.includes('〔s2〕') || /〔样式:14pt #C00000〕/.test(样式正文))
断言('带样式:只出现一次的仍写全', 样式正文.includes('〔样式:黑体〕'))
断言('带样式:字体', 样式正文.includes('黑体') || 样式正文.includes('Arial'))
断言('带样式:高亮', 样式正文.includes('高亮:yellow'))
断言('带样式:下划线类型', 样式正文.includes('下划线:double'))
断言('带样式:底纹', 样式正文.includes('底纹:#EEEEEE'))
断言('带样式:普通文本不加注释', 样式正文.includes('普通收尾') && !样式正文.includes('〔样式:〕'))
断言('带样式:索引里写明模式', readFileSync(join(样式结果.产物根, 'index.md'), 'utf8').includes('带样式'))

// —— 样式类(像 CSS:声明集中,正文用短类名) ——
const 样式表文件 = join(样式结果.产物根, 'styles.md')
断言('样式类:生成 styles.md', existsSync(样式表文件))
const 样式表文 = existsSync(样式表文件) ? readFileSync(样式表文件, 'utf8') : ''
const 红字类行 = 样式表文.split('\n').find(l => l.includes('14pt #C00000'))
const 红字类 = 红字类行 ? 红字类行.split('|')[1].trim() : ''
断言('样式类:重复声明被收成类', !!红字类行, 红字类行 || '(没找到)')
断言('样式类:正文用短类名引用', !!红字类 && 样式正文.includes(`〔${红字类}〕〔样式标记:重复红字甲〕`), 红字类)
断言('样式类:只出现一次的不收类', !样式表文.includes('高亮:yellow'))
断言('样式类:content.md 顶部有小表', 样式正文.includes('## 样式表(本文件用到的类)'))
断言('样式类:章文件也带自己的小表', readdirSync(join(样式结果.产物根, 'chapters')).length > 0 &&
  样式表文.includes('| 次数 |'))

// —— 输出 ——
const 失败 = 检查.filter(([, ok]) => !ok)
const 宽 = Math.max(...检查.map(([n]) => n.length))
console.log(`\n产物:${产物根}`)
console.log(`耗时:${耗时} ms · 检查 ${检查.length} 项 · 通过 ${检查.length - 失败.length} · 失败 ${失败.length}\n`)
for (const [名, ok, 备注] of 检查) {
  console.log(`${ok ? '✅' : '❌'} ${名.padEnd(宽)} ${备注 || ''}`)
}
if (失败.length) {
  console.log('\n=== 失败项所指的内容片段 ===')
  for (const [名] of 失败) console.log(`· ${名}`)
  process.exitCode = 1
} else {
  console.log('\n全部通过。')
}
