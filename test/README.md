# 测试

## 直接能跑(不需要外部文件)

```bash
node test/verify-full.js     # 主回归:现造一份"每类内容都有"的 docx,跑 183 项断言
node test/smoke.js           # ZIP + XML 底层
node test/run-convert.js     # 小夹具端到端
```

这三个都**自己造夹具**(`fixtures-full.js`),不依赖任何样本文档,克隆下来即可跑。

## 需要自备文档的(工具类)

```bash
node test/roundtrip.js <你的.docx>              # 往返:转 → 回写 → 再转,正文逐行比
node test/inspect-docx.js <你的.docx>           # 页面设置 / 段落与字符格式统计
node test/check-pagination.js <你的.docx>       # 分页标记与"重复分页"检查
node test/final-check.js <你的.docx>            # 交付前自检(结构/页面/分页/颜色/字号)
node test/dump-para.js <你的.docx> [n]          # 打印前 n 段 XML
node test/dump-sections.js <你的.docx>          # 所有 sectPr 与页面信息
node test/find-size.js <你的.docx> <半磅> [xml] # 查某字号的 run 在哪个段落
node test/page-size.js <你的.docx> [...]        # 纸张尺寸与估算页数
node test/verify-format.js <产物目录> <docx>    # 只改格式、没动文字?
node test/format-paper.js <可编辑产物目录>       # 套学术论文格式 → 论文格式.docx
```

## `.doc` / `.odt`(拓展插件)

已接入正式路径:非 docx 输入由 `src/import/office.js` 调用 `@deepseek-ai/libreoffice-kit`
(自带 LibreOffice 引擎)规范化为 `_source.docx`,随后走与原生 docx 相同的解析链路。

```bash
node test/verify-import.js    # 魔数判定 + .doc 端到端 + 缓存(15 项断言,需要引擎)
```

## PDF(先分类再转)

`src/import/pdf.js` 先分类:**文本型/混合型**交给 `pdf2docx`(Python)转 docx;
**图片型(扫描件)**直接拒绝并说明需要 OCR。判据是每页文本操作符数,不是图片数量。

```bash
node test/verify-pdf.js                                  # 分类判据 + 拒绝分支(7 项断言)
$env:DSHM_TEST_PDF='D:\某论文.pdf'; node test/verify-pdf.js   # 再加端到端
```

## 公式(定位 / 裁图 / 识别 / 写回)

```bash
node test/单页.mjs 5 [源PDF]    # 抠一页走完整链路,20~40 秒,迭代用
node test/整份.mjs [源PDF]      # 整篇过一遍,暴露只在长文档上才犯的错
```

两个都吃 `vendor/python`(自带 PyMuPDF / pix2tex),不需要本机装 Python。
`单页.mjs` 默认取 `D:\APP\dsh\.test-paper.pdf` 的第 5 页 —— 公式 (2)(3)(4) 在那里。

端到端样本**不提交进仓库**:放一份 `test/sample.pdf`,或用 `DSHM_TEST_PDF` 指过去;
两者都没有时只跑分类部分(需要 `pip install pdf2docx`)。

下面三个是**早期研究用**探针(自研 CFB 解析路线的遗留),现在不再需要:

```bash
node test/probe-doc.js <你的.doc>         # CFB 流清单 + FIB + 分片表取正文
node test/probe-doc-tables.js <你的.doc>  # 样式表/属性表定位
node test/probe-doc-fkp.js <你的.doc>     # 字符/段落属性页(FKP)解码
```

## 为什么不提交样本文档

`test/sample*.docx` / `test/sample*.doc` 是第三方示例文档(体积大、授权各异),
已列入 `.gitignore`。需要时自己放一份到 `test/` 下,或直接把路径传给上面的命令。
