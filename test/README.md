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

## `.doc`(Word 97-2003)探针

`.doc` 支持尚在评估阶段(见仓库 `doc/旧格式doc-可行性分析.md`),下面是研究用探针:

```bash
node test/probe-doc.js <你的.doc>         # CFB 流清单 + FIB + 分片表取正文
node test/probe-doc-tables.js <你的.doc>  # 样式表/属性表定位
node test/probe-doc-fkp.js <你的.doc>     # 字符/段落属性页(FKP)解码
```

## 为什么不提交样本文档

`test/sample*.docx` / `test/sample*.doc` 是第三方示例文档(体积大、授权各异),
已列入 `.gitignore`。需要时自己放一份到 `test/` 下,或直接把路径传给上面的命令。
