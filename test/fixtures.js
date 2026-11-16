/**
 * 测试夹具:自己造一份"内容尽量全"的 docx。
 *
 * 目的:每个 block 模块都要有对应的块可以验;新增能力时往这里加一段即可。
 */

import { 写Zip } from './zip-writer.js'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
)

const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
 xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
 xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"`

/** 段落的公共包装 */
const 段 = (内容, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${内容}</w:p>`
const 文 = (t, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`

const 文档正文 = `
${段(文('第一章 概述'), '<w:pStyle w:val="Heading1"/>')}
${段(文('正文含') + 文('粗体', '<w:b/>') + 文('与') + 文('斜体', '<w:i/>') + 文('以及上标') + 文('2', '<w:vertAlign w:val="superscript"/>') + '<w:r><w:tab/></w:r>' + 文('制表后结束。'))}
${段(文('带编号的要点:'), '<w:pStyle w:val="Heading2"/>')}
${段(文('项目符号一'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')}
${段(文('项目符号二'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')}
${段(文('第一条'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>')}
${段(文('第一条下面的子项'), '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="2"/></w:numPr>')}
${段(文('第二条'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>')}
${段(文('表 1 指标表'), '<w:pStyle w:val="Caption"/>')}
<w:tbl>
  <w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblCaption w:val="指标表"/></w:tblPr>
  <w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>
  <w:tr><w:trPr><w:tblHeader/></w:trPr>
    <w:tc><w:tcPr><w:gridSpan w:val="3"/></w:tcPr>${段(文('合并表头'))}</w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr>${段(文('纵向合并'))}</w:tc>
    <w:tc>${段(文('单元格 A'))}</w:tc>
    <w:tc>${段(文('12.5%'))}</w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:vMerge/></w:tcPr>${段('')}</w:tc>
    <w:tc>${段(文('单元格 B') + '<w:r><w:br/></w:r>' + 文('换行后'))}</w:tc>
    <w:tc>${段(文('含公式 '))}${段('<m:oMath><m:r><m:t>x</m:t></m:r><m:sSup><m:e><m:r><m:t>a</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:oMath>')}</w:tc>
  </w:tr>
</w:tbl>
${段(文('下面是图片:'), '<w:pStyle w:val="Heading2"/>')}
${段(`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">
  <wp:extent cx="952500" cy="952500"/>
  <wp:docPr id="1" name="图1" descr="行内图的替代文字"/>
  <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
    <pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr>
      <pic:blipFill><a:blip r:embed="rId10"/></pic:blipFill>
      <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="952500" cy="952500"/></a:xfrm></pic:spPr>
    </pic:pic>
  </a:graphicData></a:graphic>
</wp:inline></w:drawing></w:r>`)}
${段(文('浮动图:'))}
${段(`<w:r><w:drawing><wp:anchor behindDoc="0" distT="0" distB="0" distL="0" distR="0" simplePos="0">
  <wp:extent cx="1905000" cy="1905000"/>
  <wp:docPr id="2" name="图2" descr="浮动的图"/>
  <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
    <pic:pic><pic:nvPicPr><pic:cNvPr id="2" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr>
      <pic:blipFill><a:blip r:embed="rId10"/></pic:blipFill>
    </pic:pic>
  </a:graphicData></a:graphic>
</wp:anchor></w:drawing></w:r>`)}
${段(文('公式合集:'), '<w:pStyle w:val="Heading2"/>')}
${段('<m:oMathPara><m:oMath><m:f><m:num><m:r><m:t>a</m:t></m:r></m:num><m:den><m:r><m:t>b</m:t></m:r></m:den></m:f></m:oMath></m:oMathPara>')}
${段('<m:oMath><m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e><m:r><m:t>x</m:t></m:r></m:e></m:rad></m:oMath>')}
${段('<m:oMath><m:nary><m:naryPr><m:chr m:val="∑"/><m:limLoc m:val="undOvr"/></m:naryPr><m:sub><m:r><m:t>i=1</m:t></m:r></m:sub><m:sup><m:r><m:t>n</m:t></m:r></m:sup><m:e><m:r><m:t>x</m:t></m:r></m:e></m:nary></m:oMath>')}
${段('<m:oMath><m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e><m:r><m:t>y</m:t></m:r></m:e></m:d></m:oMath>')}
${段('<m:oMath><m:func><m:fName><m:r><m:t>sin</m:t></m:r></m:fName><m:e><m:r><m:t>x</m:t></m:r></m:e></m:func></m:oMath>')}
${段('<m:oMath><m:m><m:mr><m:e><m:r><m:t>1</m:t></m:r></m:e><m:e><m:r><m:t>0</m:t></m:r></m:e></m:mr><m:mr><m:e><m:r><m:t>0</m:t></m:r></m:e><m:e><m:r><m:t>1</m:t></m:r></m:e></m:mr></m:m></m:oMath>')}
${段('<m:oMath><m:acc><m:accPr><m:chr m:val="̂"/></m:accPr><m:e><m:r><m:t>v</m:t></m:r></m:e></m:acc></m:oMath>')}
${段('<m:oMath><m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e><m:r><m:t>z</m:t></m:r></m:e></m:bar></m:oMath>')}
${段('<m:oMath><m:borderBox><m:e><m:r><m:t>q</m:t></m:r></m:e></m:borderBox></m:oMath>')}
${段(文('脚注引用') + '<w:r><w:footnoteReference w:id="1"/></w:r>')}
${段('<w:commentRangeStart w:id="0"/>' + 文('这段有批注') + '<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>')}
${段('<w:ins w:id="1" w:author="张三" w:date="2026-01-02T03:04:05Z">' + 文('新增的句子') + '</w:ins>' + '<w:del w:id="2" w:author="张三" w:date="2026-01-02T03:04:06Z"><w:r><w:delText>被删掉的句子</w:delText></w:r></w:del>')}
${段('<w:sdt><w:sdtPr><w:alias w:val="同意"/><w:checkbox/></w:sdtPr><w:sdtContent>' + 文('☑') + '</w:sdtContent></w:sdt>')}
${段('<w:hyperlink r:id="rId20">' + 文('外链文字') + '</w:hyperlink>')}
${段('<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' + 文('3') + '<w:r><w:fldChar w:fldCharType="end"/></w:r>')}
${段('<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> SEQ 图 \\* ARABIC </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' + 文('图 1') + '<w:r><w:fldChar w:fldCharType="end"/></w:r>')}
${段(文('文本框里的字'))}
<w:p><w:r><w:pict><v:shape xmlns:v="urn:schemas-microsoft-com:vml" style="width:100pt;height:40pt"><v:textbox><w:txbxContent>${段(文('VML 文本框内容'))}</w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>
<w:sectPr>
  <w:headerReference w:type="default" r:id="rId30"/>
  <w:pgSz w:w="11906" w:h="16838"/>
  <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
  <w:cols w:num="2"/>
</w:sectPr>
`

const 主文档 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${文档正文}</w:body></w:document>`

const 样式 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="宋体"/><w:sz w:val="21"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Heading1"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="character" w:styleId="Strong"><w:name w:val="Strong"/><w:rPr><w:b/></w:rPr></w:style>
</w:styles>`

const 编号 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:pPr><w:ind w:left="720"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="2">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2)"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>
</w:numbering>`

const 脚注 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:footnote w:type="separator" w:id="-1">${段(文('---'))}</w:footnote>
  <w:footnote w:id="1">${段('<w:r><w:footnoteRef/></w:r>' + 文(' 这是一条脚注正文'))}</w:footnote>
</w:footnotes>`

const 批注 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="0" w:author="李四" w:date="2026-02-03T00:00:00Z" w:initials="LS">${段(文('这条需要复核'))}</w:comment>
</w:comments>`

const 页眉 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${段(文('页眉:年报 2026'))}</w:hdr>`

const 内容类型 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>
  <Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`

const 根关系 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`

const 文档关系 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>
  <Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
  <Relationship Id="rId20" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/年报" TargetMode="External"/>
  <Relationship Id="rId30" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
</Relationships>`

const 核心属性 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>年报 2026</dc:title>
  <dc:creator>张三</dc:creator>
  <cp:lastModifiedBy>李四</cp:lastModifiedBy>
  <cp:revision>7</cp:revision>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-02-02T00:00:00Z</dcterms:modified>
</cp:coreProperties>`

const 应用属性 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Microsoft Office Word</Application>
  <Pages>3</Pages>
  <Words>520</Words>
  <Characters>1800</Characters>
  <Paragraphs>42</Paragraphs>
  <Company>喵工作室</Company>
</Properties>`

/** 生成夹具 docx 的字节 */
export function 造夹具 () {
  return 写Zip({
    '[Content_Types].xml': 内容类型,
    '_rels/.rels': 根关系,
    'word/document.xml': 主文档,
    'word/_rels/document.xml.rels': 文档关系,
    'word/styles.xml': 样式,
    'word/numbering.xml': 编号,
    'word/footnotes.xml': 脚注,
    'word/comments.xml': 批注,
    'word/header1.xml': 页眉,
    'word/media/image1.png': PNG,
    'docProps/core.xml': 核心属性,
    'docProps/app.xml': 应用属性
  })
}
