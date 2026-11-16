/**
 * 全量夹具:把 `doc/doc文档内容清单.md` 里列的内容**每一类都塞一份**。
 *
 * 目的不是"像一篇真文档",而是"覆盖每一种边界":
 * 每个块的文本里都带一个 **〔标记:xxx〕** 前缀,验收脚本按标记断言,漏了立刻能看出来。
 */

import { 写Zip } from './zip-writer.js'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAAlwSFlzAAALEwAACxMBAJqcGAAAAABJRU5ErkJggg==',
  'base64'
)

/** 假装是 EMF(只测"格式不认 → 明确标注",不测渲染) */
const EMF = Buffer.from('01000000454D4600000100', 'hex')

const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
 xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
 xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
 xmlns:v="urn:schemas-microsoft-com:vml"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
 xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"
 xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"`

const 段 = (内容, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${内容}</w:p>`
const 文 = (t, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`
const 标题 = (t, 级) => 段(文(t), `<w:pStyle w:val="Heading${级}"/>`)
const 项 = (t, numId, ilvl = 0) => 段(文(t), `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`)
const 域 = (指令, 结果) =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
  `<w:r><w:instrText xml:space="preserve"> ${指令} </w:instrText></w:r>` +
  `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
  (结果 ? 文(结果) : '') +
  `<w:r><w:fldChar w:fldCharType="end"/></w:r>`

/** 一张图(行内 / 浮动) */
function 图 (rid, alt, { 浮动 = false, 宽 = 100, 高 = 100, 裁剪 = null, 旋转 = null } = {}) {
  const emu = (px) => px * 9525
  const 裁剪xml = 裁剪
    ? `<a:srcRect l="${裁剪.左 || 0}" t="${裁剪.上 || 0}" r="${裁剪.右 || 0}" b="${裁剪.下 || 0}"/>`
    : ''
  const 变换 = `<a:xfrm${旋转 ? ` rot="${Math.round(旋转 * 60000)}"` : ''}>` +
    `<a:off x="0" y="0"/><a:ext cx="${emu(宽)}" cy="${emu(高)}"/></a:xfrm>`
  const 内容 =
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="图"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/>${裁剪xml}</pic:blipFill>` +
    `<pic:spPr>${变换}</pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic>`
  if (!浮动) {
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
      `<wp:extent cx="${emu(宽)}" cy="${emu(高)}"/><wp:docPr id="1" name="图1" descr="${alt}"/>` +
      `${内容}</wp:inline></w:drawing></w:r>`
  }
  return `<w:r><w:drawing><wp:anchor behindDoc="0" distT="0" distB="0" distL="0" distR="0" simplePos="0">` +
    `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>914400</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${emu(宽)}" cy="${emu(高)}"/><wp:wrapSquare wrapText="bothSides"/>` +
    `<wp:docPr id="2" name="图2" descr="${alt}"/>` +
    `${内容}</wp:anchor></w:drawing></w:r>`
}

// ======================= 正文 =======================

const 正文 = `
${标题('第一章 全部内容测试', 1)}

${段(文('〔标记:普通段落〕') + 文('粗体', '<w:b/>') + 文('斜体', '<w:i/>') +
    文('下划线', '<w:u w:val="single"/>') + 文('删除线', '<w:strike/>') +
    文('上标', '<w:vertAlign w:val="superscript"/>') + 文('下标', '<w:vertAlign w:val="subscript"/>') +
    文('隐藏文字不应出现', '<w:vanish/>') + 文('字符样式强调', '<w:rStyle w:val="Strong"/>'))}

${段(文('〔字符版式:字间距〕', '<w:spacing w:val="40"/>') +
    文('〔字符版式:缩放〕', '<w:w w:val="150"/>') +
    文('〔字符版式:大写〕', '<w:caps/>') +
    文('〔字符版式:着重号〕', '<w:em w:val="dot"/>') +
    文('〔字符版式:升降〕', '<w:position w:val="6"/>'))}

${段(文('〔标记:带制表位与框架的段落〕'),
    '<w:tabs><w:tab w:val="left" w:pos="720"/><w:tab w:val="right" w:pos="8000" w:leader="dot"/></w:tabs>' +
    '<w:framePr w:w="4000" w:h="600" w:hAnchor="margin" w:vAnchor="text" w:wrap="around" w:x="720" w:y="0"/>')}

${段(文('〔标记:空段落后面是空的〕'))}
${段('')}

${段(文('〔标记:特殊字符〕') + '<w:r><w:tab/></w:r>' + 文('制表符后') + '<w:r><w:br/></w:r>' +
    文('换行后') + 文('软连字符', '') + '<w:r><w:softHyphen/></w:r>' +
    '<w:r><w:noBreakHyphen/></w:r>' + '<w:r><w:noBreakSpace/></w:r>' +
    '<w:r><w:sym w:font="Wingdings" w:char="F0FC"/></w:r>')}

${段('<w:r><w:ruby><w:rubyPr><w:rubyAlign w:val="distributeSpace"/></w:rubyPr>' +
    '<w:rt><w:r><w:t>hàn</w:t></w:r></w:rt><w:rubyBase><w:r><w:t>汉</w:t></w:r></w:rubyBase></w:ruby></w:r>' +
    文('〔拼音括号里应是 han〕'))}

${段(文('〔标记:分页符〕') + '<w:r><w:br w:type="page"/></w:r>' + 文('分页后') +
    '<w:r><w:br w:type="column"/></w:r>' + 文('分栏后'))}

${段(文('〔样式标记:重复红字甲〕', '<w:color w:val="C00000"/><w:sz w:val="28"/>'))}
${段(文('〔样式标记:重复红字乙〕', '<w:color w:val="C00000"/><w:sz w:val="28"/>'))}
${段(文('〔样式标记:重复红字丙〕', '<w:color w:val="C00000"/><w:sz w:val="28"/>'))}

${段(文('〔标记:居中且缩进的段落〕'),
    '<w:jc w:val="center"/><w:ind w:left="720" w:right="360" w:firstLine="480"/>' +
    '<w:spacing w:line="360" w:lineRule="auto" w:before="120" w:after="240"/>')}

${段(文('〔标记:带边框底纹的段落〕'), '<w:pBdr><w:top w:val="single" w:sz="4"/></w:pBdr><w:shd w:val="clear" w:fill="EEEEEE"/>')}

${段(文('〔样式标记:红色14磅〕', '<w:color w:val="C00000"/><w:sz w:val="28"/>') +
    文('〔样式标记:黑体Arial〕', '<w:rFonts w:ascii="Arial" w:eastAsia="黑体"/>') +
    文('〔样式标记:黄底高亮〕', '<w:highlight w:val="yellow"/>') +
    文('〔样式标记:双下划线〕', '<w:u w:val="double"/>') +
    文('〔样式标记:灰底纹〕', '<w:shd w:val="clear" w:fill="EEEEEE"/>') +
    文('普通收尾'))}

${标题('1.1 列表', 2)}
${段(文('〔标记:下列为各级列表〕'))}
${项('〔列表:无序一〕', 1)}
${项('〔列表:无序二〕', 1)}
${项('〔列表:有序第一条〕', 2, 0)}
${项('〔列表:有序子项 a〕', 2, 1)}
${项('〔列表:有序子项 b〕', 2, 1)}
${项('〔列表:有序第二条〕', 2, 0)}
${项('〔列表:重启用例 A〕', 3, 0)}
${项('〔列表:重启用例 B〕', 3, 0)}
${项('〔列表:中文编号一〕', 4, 0)}
${项('〔列表:罗马编号一〕', 5, 0)}

${标题('1.2 表格', 2)}
${段(文('〔标记:基础表格在上方〕'))}
<w:tbl>
  <w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblLayout w:type="fixed"/>
    <w:tblBorders><w:top w:val="single" w:sz="8" w:color="auto"/><w:insideH w:val="dotted" w:sz="4" w:color="FF0000"/></w:tblBorders>
    <w:shd w:val="clear" w:fill="F2F2F2"/><w:jc w:val="center"/></w:tblPr>
  <w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>
  <w:tr><w:trPr><w:tblHeader/><w:trHeight w:val="480" w:hRule="atLeast"/></w:trPr>
    <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>${段(文('表头A'))}</w:tc><w:tc>${段(文('表头B'))}</w:tc><w:tc>${段(文('表头C'))}</w:tc>
  </w:tr>
  <w:tr>
    <w:tc>${段(文('甲'))}</w:tc><w:tc>${段(文('乙'))}</w:tc><w:tc>${段(文('丙'))}</w:tc>
  </w:tr>
</w:tbl>

${段(文('〔标记:合并单元格表格〕'))}
<w:tbl>
  <w:tblPr><w:tblCaption w:val="合并表"/><w:tblDescription w:val="含横向与纵向合并"/></w:tblPr>
  <w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>
  <w:tr>
    <w:tc><w:tcPr><w:gridSpan w:val="3"/></w:tcPr>${段(文('横跨三列'))}</w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr>${段(文('纵向起点'))}</w:tc>
    <w:tc><w:tcPr><w:textDirection w:val="btLr"/><w:shd w:val="clear" w:fill="DDEBF7"/>
      <w:tcBorders><w:tl2br w:val="single" w:sz="4"/></w:tcBorders></w:tcPr>${段(文('竖排文字'))}</w:tc>
    <w:tc>${段(文('普通格'))}</w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:vMerge/></w:tcPr>${段('')}</w:tc>
    <w:tc>${段(文('格内图片:') + 图('rIdImage1', '格内图'))}</w:tc>
    <w:tc>${段('<m:oMath><m:r><m:t>y=ax+b</m:t></m:r></m:oMath>')}</w:tc>
  </w:tr>
</w:tbl>

${段(文('〔标记:嵌套表格〕'))}
<w:tbl>
  <w:tblGrid><w:gridCol w:w="6000"/></w:tblGrid>
  <w:tr><w:tc>
    ${段(文('外层格,内嵌一张表:'))}
    <w:tbl>
      <w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>
      <w:tr><w:tc>${段(文('内1'))}</w:tc><w:tc>${段(文('内2'))}</w:tc></w:tr>
    </w:tbl>
  </w:tc></w:tr>
</w:tbl>

${标题('1.3 图片', 2)}
${段(文('〔标记:行内图〕') + 图('rIdImage1', '行内图的替代文字', { 裁剪: { 左: 10000, 上: 5000 }, 旋转: 15 }))}
${段(文('〔标记:浮动图〕') + 图('rIdImage1', '浮动图的替代文字', { 浮动: true, 宽: 200, 高: 150 }))}
${段(文('〔标记:VML 老图〕') +
    '<w:r><w:pict><v:shape style="width:80pt;height:60pt"><v:imagedata r:id="rIdImage1" o:title="VML 图标题"/></v:shape></w:pict></w:r>')}
${段(文('〔标记:兼容内容应取 PNG〕') +
    '<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing>' +
    '<wp:inline><wp:extent cx="95250" cy="95250"/><wp:docPr id="9" name="svg" descr="SVG 版"/>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic><pic:nvPicPr><pic:cNvPr id="9" name="x"/><pic:cNvPicPr/></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:embed="rIdSvg"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>' +
    '</wp:inline></w:drawing></mc:Choice><mc:Fallback><w:drawing>' +
    '<wp:inline><wp:extent cx="95250" cy="95250"/><wp:docPr id="10" name="png" descr="PNG 版回退"/>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic><pic:nvPicPr><pic:cNvPr id="10" name="x"/><pic:cNvPicPr/></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:embed="rIdImage1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>' +
    '</wp:inline></w:drawing></mc:Fallback></mc:AlternateContent></w:r>')}
${段(文('〔标记:外链图片应提示未随文档提供〕') +
    '<w:r><w:drawing><wp:inline><wp:extent cx="95250" cy="95250"/><wp:docPr id="11" name="link" descr="外链图"/>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic><pic:nvPicPr><pic:cNvPr id="11" name="x"/><pic:cNvPicPr/></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:link="rIdLinkImage"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>' +
    '</wp:inline></w:drawing></w:r>')}
${段(文('〔标记:EMF 矢量图〕') + 图('rIdEmf', 'EMF 矢量图'))}

${标题('1.4 公式', 2)}
${段(文('〔标记:公式合集〕'))}
${段('<m:oMathPara><m:oMath><m:f><m:num><m:r><m:t>a+b</m:t></m:r></m:num><m:den><m:r><m:t>c</m:t></m:r></m:den></m:f></m:oMath></m:oMathPara>')}
${段('<m:oMath><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:oMath>')}
${段('<m:oMath><m:sSub><m:e><m:r><m:t>a</m:t></m:r></m:e><m:sub><m:r><m:t>i</m:t></m:r></m:sub></m:sSub></m:oMath>')}
${段('<m:oMath><m:sSubSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sub><m:r><m:t>1</m:t></m:r></m:sub><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSubSup></m:oMath>')}
${段('<m:oMath><m:sPre><m:sub><m:r><m:t>0</m:t></m:r></m:sub><m:sup><m:r><m:t>1</m:t></m:r></m:sup><m:e><m:r><m:t>F</m:t></m:r></m:e></m:sPre></m:oMath>')}
${段('<m:oMath><m:rad><m:radPr><m:degHide m:val="0"/></m:radPr><m:deg><m:r><m:t>3</m:t></m:r></m:deg><m:e><m:r><m:t>x</m:t></m:r></m:e></m:rad></m:oMath>')}
${段('<m:oMath><m:nary><m:naryPr><m:chr m:val="∑"/><m:limLoc m:val="undOvr"/></m:naryPr><m:sub><m:r><m:t>i=1</m:t></m:r></m:sub><m:sup><m:r><m:t>n</m:t></m:r></m:sup><m:e><m:r><m:t>i</m:t></m:r></m:e></m:nary></m:oMath>')}
${段('<m:oMath><m:nary><m:naryPr><m:chr m:val="∫"/></m:naryPr><m:sub><m:r><m:t>0</m:t></m:r></m:sub><m:sup><m:r><m:t>1</m:t></m:r></m:sup><m:e><m:r><m:t>f(x)dx</m:t></m:r></m:e></m:nary></m:oMath>')}
${段('<m:oMath><m:d><m:dPr><m:begChr m:val="("/><m:endChr m:val="]"/><m:sepChr m:val="|"/></m:dPr><m:e><m:r><m:t>a</m:t></m:r></m:e><m:e><m:r><m:t>b</m:t></m:r></m:e></m:d></m:oMath>')}
${段('<m:oMath><m:func><m:fName><m:r><m:t>log</m:t></m:r></m:fName><m:e><m:r><m:t>x</m:t></m:r></m:e></m:func></m:oMath>')}
${段('<m:oMath><m:limLow><m:e><m:r><m:t>lim</m:t></m:r></m:e><m:lim><m:r><m:t>n→∞</m:t></m:r></m:lim></m:limLow></m:oMath>')}
${段('<m:oMath><m:limUpp><m:e><m:r><m:t>X</m:t></m:r></m:e><m:lim><m:r><m:t>′</m:t></m:r></m:lim></m:limUpp></m:oMath>')}
${段('<m:oMath><m:m><m:mr><m:e><m:r><m:t>1</m:t></m:r></m:e><m:e><m:r><m:t>2</m:t></m:r></m:e></m:mr><m:mr><m:e><m:r><m:t>3</m:t></m:r></m:e><m:e><m:r><m:t>4</m:t></m:r></m:e></m:mr></m:m></m:oMath>')}
${段('<m:oMath><m:eqArr><m:e><m:r><m:t>x+y=1</m:t></m:r></m:e><m:e><m:r><m:t>y=2</m:t></m:r></m:e></m:eqArr></m:oMath>')}
${段('<m:oMath><m:acc><m:accPr><m:chr m:val="&#x0302;"/></m:accPr><m:e><m:r><m:t>a</m:t></m:r></m:e></m:acc></m:oMath>')}
${段('<m:oMath><m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e><m:r><m:t>b</m:t></m:r></m:e></m:bar></m:oMath>')}
${段('<m:oMath><m:groupChr><m:groupChrPr><m:chr m:val="⏟"/><m:pos m:val="bot"/></m:groupChrPr><m:e><m:r><m:t>c</m:t></m:r></m:e></m:groupChr></m:oMath>')}
${段('<m:oMath><m:borderBox><m:e><m:r><m:t>d</m:t></m:r></m:e></m:borderBox></m:oMath>')}
${段('<m:oMath><m:phant><m:e><m:r><m:t>e</m:t></m:r></m:e></m:phant></m:oMath>')}
${段('<m:oMath><m:box><m:e><m:r><m:t>g</m:t></m:r></m:e></m:box></m:oMath>')}
${段('<m:oMath><m:r><m:t>∑</m:t></m:r><m:r><m:t>∫</m:t></m:r><m:r><m:t>α</m:t></m:r><m:r><m:t>≤</m:t></m:r></m:oMath>')}
${段('<m:oMath><m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e><m:r><m:t>z</m:t></m:r></m:e></m:rad></m:oMath>')}

${标题('1.5 域与引用', 2)}
${段(文('〔标记:目录域〕'))}
${段(域('TOC \\o "1-3" \\h', '第一章 全部内容测试……1'))}
${段(文('〔标记:页码域应标不可得〕') + 域('PAGE', '7'))}
${段(域('NUMPAGES', '12'))}
${段(域('PAGEREF _Ref1 \\h', '9'))}
${段(域('REF _Ref1 \\h', '见第 3 节'))}
${段(域('SEQ 表 \\* ARABIC', '表 2'))}
${段(域('HYPERLINK "https://example.com/域链接"', '域形式的超链接'))}
${段(域('DATE \\@ "yyyy-MM-dd"', '2026-01-01'))}
${段(域('EQ \\f(a,b)', '（老式公式缓存）'))}
${段(域('STYLEREF "Heading 1"', '第一章 全部内容测试'))}
${段(域('DOCPROPERTY Title', '全量测试文档'))}
${段(域('MERGEFIELD 客户名称', '喵工作室'))}
${段(域('INCLUDETEXT "外部.txt"', '外部文件缓存内容'))}
${段(文('简单域写法:') + '<w:fldSimple w:instr=" DATE \\@ &quot;yyyy&quot; "><w:r><w:t>2026</w:t></w:r></w:fldSimple>')}
${段(文('脏域:') + '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>99</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>')}
${段(文('需重算的题注域:') + '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> SEQ 图 \\* ARABIC </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' + 文('图 3') + '<w:r><w:fldChar w:fldCharType="end"/></w:r>')}

${标题('1.6 注释与修订', 2)}
${段(文('〔标记:脚注〕正文脚注引用') + '<w:r><w:footnoteReference w:id="2"/></w:r>' + 文(',尾注引用') + '<w:r><w:endnoteReference w:id="2"/></w:r>')}
${段('<w:commentRangeStart w:id="2"/>' + 文('〔标记:这段有批注〕') + '<w:commentRangeEnd w:id="2"/>' +
    '<w:r><w:commentReference w:id="2"/></w:r>')}
${段(文('〔标记:修订插入〕') + '<w:ins w:id="10" w:author="张三" w:date="2026-03-01T00:00:00Z">' + 文('新增内容应保留') + '</w:ins>')}
${段(文('〔标记:修订删除〕') + '<w:del w:id="11" w:author="张三" w:date="2026-03-01T00:00:01Z"><w:r><w:delText>删除内容应剔除</w:delText></w:r></w:del>')}
${段('<w:moveFrom w:id="12" w:author="李四" w:date="2026-03-02T00:00:00Z">' + 文('〔标记:移动源〕原位置文字') + '</w:moveFrom>' +
    '<w:moveTo w:id="13" w:author="李四" w:date="2026-03-02T00:00:01Z">' + 文('〔标记:移动目标〕新位置文字') + '</w:moveTo>')}
${段('<w:r><w:rPr><w:rPrChange w:id="14" w:author="王五" w:date="2026-03-03T00:00:00Z"><w:rPr><w:b/></w:rPr></w:rPrChange></w:rPr>' + '<w:t>格式被改过的文字</w:t></w:r>')}

${标题('1.7 内容控件', 2)}
${段(文('〔标记:富文本控件〕'))}
<w:sdt><w:sdtPr><w:alias w:val="富文本区"/><w:richText/></w:sdtPr><w:sdtContent>${段(文('控件里的正文'))}</w:sdtContent></w:sdt>
<w:sdt><w:sdtPr><w:alias w:val="纯文本区"/><w:text/></w:sdtPr><w:sdtContent>${段(文('纯文本控件内容'))}</w:sdtContent></w:sdt>
<w:sdt><w:sdtPr><w:alias w:val="同意条款"/><w:checkbox><w:checked w:val="1"/></w:checkbox></w:sdtPr><w:sdtContent>${段(文('☑'))}</w:sdtContent></w:sdt>
<w:sdt><w:sdtPr><w:alias w:val="选择项"/><w:dropDownList><w:listItem w:displayText="甲" w:value="a"/></w:dropDownList></w:sdtPr><w:sdtContent>${段(文('甲'))}</w:sdtContent></w:sdt>
<w:sdt><w:sdtPr><w:alias w:val="组合框"/><w:comboBox><w:listItem w:displayText="乙" w:value="b"/></w:comboBox></w:sdtPr><w:sdtContent>${段(文('乙'))}</w:sdtContent></w:sdt>
<w:sdt><w:sdtPr><w:alias w:val="日期选择"/><w:date/></w:sdtPr><w:sdtContent>${段(文('2026-04-05'))}</w:sdtContent></w:sdt>
<w:sdt><w:sdtPr><w:alias w:val="重复节"/><w:repeatingSection/></w:sdtPr><w:sdtContent>${段(文('重复节内容'))}</w:sdtContent></w:sdt>
<w:sdt><w:sdtPr><w:alias w:val="部件库"/><w:docPartObj><w:docPartGallery w:val="Quick Parts"/></w:docPartObj></w:sdtPr><w:sdtContent>${段(文('部件库内容'))}</w:sdtContent></w:sdt>

${标题('1.8 图形与嵌入对象', 2)}
${段(文('〔标记:VML 文本框〕') +
    '<w:r><w:pict><v:shape style="width:120pt;height:40pt"><v:textbox><w:txbxContent>' +
    段(文('VML 文本框里的文字')) + '</w:txbxContent></v:textbox></v:shape></w:pict></w:r>')}
${段(文('〔标记:形状文本框〕') +
    '<w:r><w:drawing><wp:inline><wp:extent cx="190500" cy="95250"/><wp:docPr id="20" name="形状"/>' +
    '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">' +
    '<wps:wsp><wps:cNvSpPr/><wps:spPr/><wps:txbx><w:txbxContent>' + 段(文('形状里的文字')) + '</w:txbxContent></wps:txbx>' +
    '</wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>')}
${段(文('〔标记:浮动文本框(带定位)〕') +
    '<w:r><w:drawing><wp:anchor behindDoc="0" distT="0" distB="0" distL="0" distR="0" simplePos="0" locked="1">' +
    '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:align>right</wp:align></wp:positionH>' +
    '<wp:positionV relativeFrom="paragraph"><wp:posOffset>762000</wp:posOffset></wp:positionV>' +
    '<wp:extent cx="1905000" cy="762000"/><wp:wrapSquare wrapText="bothSides"/>' +
    '<wp:docPr id="23" name="浮动框" descr="浮动的文本框"/>' +
    '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">' +
    '<wps:wsp><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1905000" cy="762000"/></a:xfrm></wps:spPr>' +
    '<wps:txbx><w:txbxContent>' + 段(文('浮动文本框里的文字')) + '</w:txbxContent></wps:txbx>' +
    '</wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>')}
${段(文('〔标记:图表数据应转文本〕') +
    '<w:r><w:drawing><wp:inline><wp:extent cx="381000" cy="254000"/><wp:docPr id="21" name="图表"/>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">' +
    '<c:chart r:id="rIdChart"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>')}
${段(文('〔标记:SmartArt 文字应转文本〕') +
    '<w:r><w:drawing><wp:inline><wp:extent cx="381000" cy="254000"/><wp:docPr id="22" name="SmartArt"/>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">' +
    '<dgm:relIds r:dm="rIdDgm" r:lo="rIdDgmLo" r:qs="rIdDgmQs" r:cs="rIdDgmCs"/>' +
    '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>')}
${段(文('〔标记:OLE 对象〕') +
    '<w:r><w:object><v:shape style="width:100pt;height:50pt"><v:imagedata r:id="rIdImage1"/></v:shape>' +
    '<o:OLEObject Type="Embed" ProgID="Equation.DSMT4" ShapeID="_x0000_i1025" r:id="rIdOle"/></w:object></w:r>')}

${标题('1.9 书签、超链接与 altChunk', 2)}
${段('<w:bookmarkStart w:id="1" w:name="章节锚点"/>' + 文('〔标记:书签段落〕') + '<w:bookmarkEnd w:id="1"/>')}
${段(文('〔标记:外部超链接〕') + '<w:hyperlink r:id="rIdLink">' + 文('点我去官网') + '</w:hyperlink>')}
${段(文('〔标记:锚点超链接〕') + '<w:hyperlink w:anchor="章节锚点">' + 文('跳到本章') + '</w:hyperlink>')}
<w:altChunk r:id="rIdAlt"/>

${段(文('〔标记:分节前〕'))}
<w:p><w:pPr><w:sectPr>
  <w:headerReference w:type="default" r:id="rIdHeader1"/>
  <w:headerReference w:type="first" r:id="rIdHeader2"/>
  <w:footerReference w:type="default" r:id="rIdFooter1"/>
  <w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>
  <w:pgMar w:top="1200" w:right="1200" w:bottom="1200" w:left="1200"/>
  <w:cols w:num="2"/>
  <w:type w:val="continuous"/>
  <w:pgNumType w:start="1"/>
</w:sectPr></w:pPr>${文('这一节是横向两栏')}</w:p>

<w:sectPr>
  <w:headerReference w:type="default" r:id="rIdHeader1"/>
  <w:footerReference w:type="default" r:id="rIdFooter1"/>
  <w:pgSz w:w="11906" w:h="16838"/>
  <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
</w:sectPr>
`

const 主文档 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${正文}</w:body></w:document>`

// ======================= 附属部件 =======================

const 样式 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="宋体"/><w:sz w:val="21"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Heading1"/>
    <w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Heading2"/>
    <w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="ChineseTitle"><w:name w:val="标题 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
  <w:style w:type="character" w:styleId="Strong"><w:name w:val="Strong"/><w:rPr><w:b/></w:rPr></w:style>
</w:styles>`

const 编号 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="2">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2)"/></w:lvl>
    <w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="lowerRoman"/><w:lvlText w:val="%3."/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="3">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1)"/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="4">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="chineseCounting"/><w:lvlText w:val="%1、"/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="5">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="upperRoman"/><w:lvlText w:val="%1."/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>
  <w:num w:numId="3"><w:abstractNumId w:val="3"/>
    <w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/></w:lvlOverride>
  </w:num>
  <w:num w:numId="4"><w:abstractNumId w:val="4"/></w:num>
  <w:num w:numId="5"><w:abstractNumId w:val="5"/></w:num>
</w:numbering>`

const 脚注 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:footnote w:type="separator" w:id="-1">${段(文('分隔符'))}</w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="0">${段(文('续分隔符'))}</w:footnote>
  <w:footnote w:id="2">${段('<w:r><w:footnoteRef/></w:r>' + 文(' 脚注正文(含行内公式 ') + '<m:oMath><m:r><m:t>E=mc^2</m:t></m:r></m:oMath>' + 文(' )'))}</w:footnote>
</w:footnotes>`

const 尾注 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:endnote w:type="separator" w:id="-1">${段(文('分隔符'))}</w:endnote>
  <w:endnote w:id="2">${段('<w:r><w:endnoteRef/></w:r>' + 文(' 尾注正文'))}</w:endnote>
</w:endnotes>`

const 批注 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <w:comment w:id="2" w:author="李四" w:initials="LS" w:date="2026-02-03T08:00:00Z">
    <w:p w14:paraId="1A2B3C4D" w14:textId="77777777">${文('这条批注需要复核')}</w:p>
  </w:comment>
</w:comments>`

const 批注扩展 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <w15:commentEx w15:paraId="1A2B3C4D" w15:paraIdParent="00PARENT" w15:done="1"/>
</w15:commentsEx>`

const 页眉1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  ${段(文('〔页眉〕全量测试文档'))}
  ${段(文('页眉里的图:') + 图('rIdImage1', '页眉图'))}
</w:hdr>`

const 页眉2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  ${段(文('〔首页页眉〕只有第一页'))}
</w:hdr>`

const 页脚1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  ${段(文('〔页脚〕第 ') + 域('PAGE', '1') + 文(' 页,共 ') + 域('NUMPAGES', '12') + 文(' 页'))}
</w:ftr>`

const 图表 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <c:chart><c:plotArea><c:barChart><c:barDir val="col"/>
    <c:ser>
      <c:idx val="0"/>
      <c:tx><c:strRef><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>销售额</c:v></c:pt></c:strCache></c:strRef></c:tx>
      <c:cat><c:strRef><c:strCache><c:ptCount val="3"/>
        <c:pt idx="0"><c:v>一月</c:v></c:pt><c:pt idx="1"><c:v>二月</c:v></c:pt><c:pt idx="2"><c:v>三月</c:v></c:pt>
      </c:strCache></c:strRef></c:cat>
      <c:val><c:numRef><c:numCache><c:ptCount val="3"/>
        <c:pt idx="0"><c:v>100</c:v></c:pt><c:pt idx="1"><c:v>150</c:v></c:pt><c:pt idx="2"><c:v>120</c:v></c:pt>
      </c:numCache></c:numRef></c:val>
    </c:ser>
    <c:ser>
      <c:idx val="1"/>
      <c:tx><c:strRef><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>预测</c:v></c:pt></c:strCache></c:strRef></c:tx>
      <c:cat><c:strRef><c:strCache><c:ptCount val="3"/>
        <c:pt idx="0"><c:v>一月</c:v></c:pt><c:pt idx="1"><c:v>二月</c:v></c:pt><c:pt idx="2"><c:v>三月</c:v></c:pt>
      </c:strCache></c:strRef></c:cat>
      <c:val><c:numRef><c:numCache><c:ptCount val="3"/>
        <c:pt idx="0"><c:v>90</c:v></c:pt><c:pt idx="1"><c:v>160</c:v></c:pt><c:pt idx="2"><c:v>130</c:v></c:pt>
      </c:numCache></c:numRef></c:val>
    </c:ser>
  </c:barChart></c:plotArea></c:chart>
</c:chartSpace>`

const 智能图形 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <dgm:ptLst>
    <dgm:pt modelId="{ROOT}"><dgm:t><a:p><a:r><a:t>年度目标</a:t></a:r></a:p></dgm:t></dgm:pt>
    <dgm:pt modelId="{C1}"><dgm:t><a:p><a:r><a:t>增长 20%</a:t></a:r></a:p></dgm:t></dgm:pt>
    <dgm:pt modelId="{C2}"><dgm:t><a:p><a:r><a:t>降本 10%</a:t></a:r></a:p></dgm:t></dgm:pt>
  </dgm:ptLst>
  <dgm:cxnLst/>
</dgm:dataModel>`

const 智能图形版式 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<dgm:layoutDef xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"/>`

const 备选HTML = `<!DOCTYPE html><html><head><title>片段</title><style>p{color:red}</style></head>
<body><h1>嵌入的 HTML 片段</h1><p>〔标记:altChunk 段落〕这段来自 altChunk。</p></body></html>`

const 核心属性 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>〔标记:全量测试文档〕</dc:title>
  <dc:subject>内容覆盖测试</dc:subject>
  <dc:creator>张三</dc:creator>
  <cp:lastModifiedBy>李四</cp:lastModifiedBy>
  <cp:revision>3</cp:revision>
  <cp:keywords>docx;测试;全量</cp:keywords>
  <cp:category>测试</cp:category>
  <dc:description>用来验证转换器覆盖面的夹具</dc:description>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-02-02T00:00:00Z</dcterms:modified>
</cp:coreProperties>`

const 应用属性 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Microsoft Office Word</Application><AppVersion>16.0000</AppVersion>
  <Pages>12</Pages><Words>1234</Words><Characters>2000</Characters><Paragraphs>58</Paragraphs><Lines>100</Lines>
  <Company>喵工作室</Company><Template>Normal.dotm</Template>
</Properties>`

const 自定义属性 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"
 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="项目编号">
    <vt:lpwstr>MIAO-2026</vt:lpwstr>
  </property>
</Properties>`

const 内容类型 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="emf" ContentType="image/x-emf"/>
  <Default Extension="html" ContentType="text/html"/>
  <Default Extension="bin" ContentType="application/octet-stream"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>
  <Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/>
  <Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>
  <Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/word/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
  <Override PartName="/word/diagrams/data1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>`

/** 文档设置:故意存 `web` 版式 —— 回写时应被改成 `print`(否则 Word 按 Web 版式打开、看不到分页) */
const 设置 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:view w:val="web"/>
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="420"/>
</w:settings>`

const 根关系 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/>
</Relationships>`

const 文档关系 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rIdFootnotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>
  <Relationship Id="rIdEndnotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/>
  <Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>
  <Relationship Id="rIdCommentsEx" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/commentsExtended" Target="commentsExtended.xml"/>
  <Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rIdHeader2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/>
  <Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  <Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
  <Relationship Id="rIdEmf" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.emf"/>
  <Relationship Id="rIdSvg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image3.svg"/>
  <Relationship Id="rIdLinkImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.com/remote.png" TargetMode="External"/>
  <Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/" TargetMode="External"/>
  <Relationship Id="rIdChart" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart1.xml"/>
  <Relationship Id="rIdDgm" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData" Target="diagrams/data1.xml"/>
  <Relationship Id="rIdDgmLo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramLayout" Target="diagrams/layout1.xml"/>
  <Relationship Id="rIdDgmQs" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramQuickStyle" Target="diagrams/quickStyle1.xml"/>
  <Relationship Id="rIdDgmCs" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramColors" Target="diagrams/colors1.xml"/>
  <Relationship Id="rIdOle" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="embeddings/oleObject1.bin"/>
  <Relationship Id="rIdAlt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="altChunk1.html"/>
</Relationships>`

const 页眉关系 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`

/** 生成全量夹具 */
export function 造全量夹具 () {
  return 写Zip({
    '[Content_Types].xml': 内容类型,
    '_rels/.rels': 根关系,
    'word/document.xml': 主文档,
    'word/settings.xml': 设置,
    'word/_rels/document.xml.rels': 文档关系,
    'word/styles.xml': 样式,
    'word/numbering.xml': 编号,
    'word/footnotes.xml': 脚注,
    'word/endnotes.xml': 尾注,
    'word/comments.xml': 批注,
    'word/commentsExtended.xml': 批注扩展,
    'word/header1.xml': 页眉1,
    'word/_rels/header1.xml.rels': 页眉关系,
    'word/header2.xml': 页眉2,
    'word/footer1.xml': 页脚1,
    'word/charts/chart1.xml': 图表,
    'word/diagrams/data1.xml': 智能图形,
    'word/diagrams/layout1.xml': 智能图形版式,
    'word/diagrams/quickStyle1.xml': 智能图形版式,
    'word/diagrams/colors1.xml': 智能图形版式,
    'word/embeddings/oleObject1.bin': Buffer.from('OLE-DUMMY'),
    'word/altChunk1.html': 备选HTML,
    'word/media/image1.png': PNG,
    'word/media/image2.emf': EMF,
    'word/media/image3.svg': '<svg xmlns="http://www.w3.org/2000/svg"><text>SVG</text></svg>',
    'docProps/core.xml': 核心属性,
    'docProps/app.xml': 应用属性,
    'docProps/custom.xml': 自定义属性
  })
}
