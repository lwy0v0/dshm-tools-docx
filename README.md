# dshm-tools-docx

喵生态的 **Word 文档工具**(`doc_convert` / `doc_build`):把 `.docx` 变成一个可检索的产物文件夹,模型用 `read` / `grep` / `read_image` 读它;需要交付文件时,改产物再回写成 `.docx`。

- **读**:正文 md + 分章 + 图片 + 索引,不用把全文塞进上下文。
- **看格式**:可选出带样式版本,颜色/字号/字体/高亮/底纹/下划线都标出来。
- **改**:可选出可编辑版本(`content.xml`),改完用 `doc_build` 回写成 docx。

| 文档 | 内容 |
| --- | --- |
| [docs/使用指南.md](docs/使用指南.md) | **新用户从这看**:安装、两个工具的调用、产物结构、常见场景、排错 |
| [docs/能力矩阵.md](docs/能力矩阵.md) | **每个元素的可读 / 可编辑 / 可写**(含实现位置与未实现原因) |
| [docs/设计.md](docs/设计.md) | 存储作用域、模块划分、可编辑视图与回写机制、踩过的坑 |

## 三十秒上手

```text
doc_convert({ file: "D:/work/年报.docx" })
→ 产物目录 D:/项目/.dshm/docx/年报-a1b2c3d4/
  read  index.md       看大纲、统计、图片清单
  grep  content.md     找句子
  read  chapters/02-….md   按章读
  read_image media/001.png  看某张图

改完之后要交付:
doc_convert({ file: "D:/work/年报.docx", edit: true })   ← 多产 content.xml + raw/
  改 content.xml
doc_build({ dir: "<上面的产物目录>" })                    ← 写出 重建.docx
```

## 边界(一句话版)

- 只支持 `.docx`。`.doc`(97-2003 二进制)明确拒绝,请先另存为 `.docx`。
- 页码、自动分页、浮动对象最终坐标**读不到**,产物里会标 `〔不可得:…〕`,不静默丢。
- 图表 / SmartArt / OLE / 文本框 / 页码域 / 批注所在段落**可读不可改**;回写时原样保留。
- 页眉页脚 / 脚注 / 批注的**部件**第一版不重建(原样继承),所以其中文字暂不可编辑。

## 零运行时依赖

只用 `node:fs` / `node:path` / `node:zlib` / `node:crypto`:ZIP 自己读写、XML 用自带的最小命名空间解析器 —— 可单独装进官方 profile。

## 测试

```
node test/smoke.js            # ZIP + XML 底层
node test/run-convert.js      # 小夹具端到端
node test/verify-full.js      # 全量夹具 + 177 项断言(含可编辑/回写往返)
node test/roundtrip.js <docx> # 任意文档往返对比:转 → 回写 → 再转,正文逐行比

# 排版样板 & 校对工具
node test/format-paper.js <可编辑产物目录>       # 改成学术论文格式 → 论文格式.docx
node test/verify-format.js <原产物目录> <docx>   # 只改格式没动文字?
node test/inspect-docx.js <docx>                 # 页面设置 / 段落与字符格式统计
node test/dump-para.js <docx> [n]                # 打印前 n 段 XML(排错)
node test/find-size.js <docx> <半磅> [xml]        # 查某字号的 run 在哪个段落
```
