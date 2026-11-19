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

- 输入支持 `.docx` / `.doc` / `.odt` / `.pdf`。非 docx 先**规范化成 docx**,再走同一条解析链路;规范化有损,丢掉的保真度写进 `〔不可得:…〕`。
- 按**魔数**判定格式,不信后缀:改名的 RTF 会被明确拒绝而不是报"不是有效 ZIP"。
- **PDF 先分类再转**:
  - **文本型**(直接保存的,有文本层)→ 可选两种解析器(见下);
  - **图片型**(扫描件,没有文本层)→ **明确拒绝**并说明需要 OCR,不假装成功;
  - **混合型**(有文本层但插图多)→ 与文本型同路。
  - 判据是**文本操作符密度**(每页 `Tj`/`TJ` 数),不是图片数量 —— 图文混排的文档图片很多但文本层完好。
- **PDF 解析器:`pdf2docx`**(`parser` 参数,当前唯一启用)。按 PDF 里的原始坐标**还原版式**:
  段落位置、图片、表格尽量贴近原文档;字体不做完全匹配 —— 缺失字形回落默认字体。
  产物目录名带解析器标识和时间码(`<名>-<时间码>-pdf2docx`,如 `论文-20261119-1411-pdf2docx`)。

  另外三家都实测过,但**都不是真还原**,已移出主代码、保留在插件的 `.test/` 下(不进版本库):

  | 解析器 | 实测结果 | 为何不用 |
  | --- | --- | --- |
  | `docling` | 标题 42 / 分章 42,0.07 MB | 做版面理解,但只输出 md/docx 仍需重排 —— **不还原版式** |
  | `pymupdf4llm` | 标题 40,0.07 MB | 只取文本层再重排 —— 更不还原 |
  | `docling-layout` | 标题 44,bbox 近似定位 | 方向对但没做完:页数膨胀(59 vs 35)、图片取不到 |

  实测同一篇 35 页 LaTeX 双栏 arXiv 论文(留档):

  | 解析器 | 耗时 | 段落 | 标题 | 图片 | 分章 | docx 体积 |
  | --- | --- | --- | --- | --- | --- | --- |
  | `pdf2docx` | 106s | 2272 | 0 | **210** | 1 | 118.62 MB |
  | `docling` | 180s | 1743 | 42 | 0 | 42 | 0.07 MB |
  | `pymupdf4llm` | 64s | 2019 | 40 | 0 | 2 | 0.07 MB |
  | `docling-layout` | 198s | 1480 | 44 | 0 | - | 51 KB |

  恢复其中任何一家:见 `src/import/parsers.js` 顶部注释。

- **公式:自动识别并写成可编辑的 Word 公式**。`pdf2docx` 不认识公式(源码里没有 equation/OMML 概念),
  会把公式碾成普通字符塞进表格,上下标与分式结构全丢。所以插件在它之外多做三步:

  | 步骤 | 做法 |
  | --- | --- |
  | **1. 定位** | PyMuPDF 扫原 PDF,按**整行**判定公式段:数学字体(CMMI/CMSY/CMEX/OpenSymbol 等)字符占比 ≥60%、不含中文、不在图表区域内、不是算法伪代码行。行内单个符号与图表标签**不算** |
  | **2. 裁图** | 300dpi 裁成 PNG 放进 `media/formulas/`;同一公式被分式/上下标拆开的多段会合并,「太小当噪声」的尺寸过滤放在**合并之后** —— 分母、上标自己就是极窄的一行,先筛会把它们整行丢掉、把公式切掉一截 |
  | **3. 识别并写回** | `pix2tex` 认成 LaTeX → 自研 `latex2omml.py`(纯标准库)→ **OMML 原位替换进 docx**,Word 里可直接编辑 |

  写回位置是**原文原位**:pdf2docx 把公式排成"单行表格 + 末列编号"或"普通段落 + 制表符 + 编号",
  插件按编号匹配后整段换成含 `m:oMathPara` 的居中段落(编号跟在公式后同一行)。
  实在匹配不上的才会集中列到文末附录,不丢。

  **已知局限**:纯斜体公式(`y=ax+b` 这种没有 ∑/∫/√ 可作锚点的)检不出来 —— 宁可漏,不误判;
  `pix2tex` 是**采样解码**(`torch.multinomial`,temperature 默认 0.25),同一张图两次跑结果可能不同,
  `Softmax` 这类正体单词偶尔会认错;多行矩阵/方程组的识别质量也会下降(原始图片仍保留在 `media/formulas/` 供对照)。

- 页码、自动分页、浮动对象最终坐标**读不到**,产物里会标 `〔不可得:…〕`,不静默丢。
- 图表 / SmartArt / OLE / 文本框 / 页码域 / 批注所在段落**可读不可改**;回写时原样保留。
- 页眉页脚 / 脚注 / 批注的**部件**第一版不重建(原样继承),所以其中文字暂不可编辑。

## 运行时依赖

docx 解析本身只用 `node:fs` / `node:path` / `node:zlib` / `node:crypto`:ZIP 自己读写、XML 用自带的最小命名空间解析器。

只有非 docx 的拓展路径需要外部引擎:

| 输入 | 依赖 | 装法 |
| --- | --- | --- |
| `.doc` / `.odt` | `@deepseek-ai/libreoffice-kit`(可选依赖,自带 LibreOffice 引擎) | 随桌面应用分发 |
| `.pdf` | **插件自带的 Python 环境**(`vendor/`) | **已内置,不需要安装任何东西** |

### 自带的 Python 环境(`vendor/`,约 1.67 GB)

`.pdf` 这条路走 Python。为了**开箱即用**,插件把整套环境打进了 `vendor/`,使用者**不需要预装 Python**。
体积确实不小,构成如下 —— 大头是公式识别要的深度学习运行时,不是本工具自己的代码:

| 内容 | 体积 | 为什么需要 |
| --- | --- | --- |
| `torch` | 521 MB | pix2tex 的推理运行时 |
| `transformers` | 112 MB | 同上 |
| `pix2tex`(含模型权重 `weights.pth` 97 MB) | 117 MB | 公式图 → LaTeX |
| `cv2`(opencv) | 112 MB | pdf2docx 的版面分析依赖 |
| `pymupdf` | 104 MB | PDF 解析 + 公式区域定位 |
| `onnxruntime` / `numpy` / `fontTools` / 其他 | ~140 MB | 上述库的依赖 |
| Python 3.14.5 运行时(embeddable) | 15 MB | 解释器本体 |

```
vendor/python/                      Python 3.14.5(embeddable,解压即用)
vendor/python/Lib/site-packages/    pdf2docx · PyMuPDF · numpy · opencv · torch · pix2tex …
```

**如果不需要公式识别**,把 `vendor/python/Lib/site-packages/` 下的
`torch`、`torchvision`、`transformers`、`pix2tex`、`timm`、`safetensors`、`tokenizers` 删掉即可,
体积能降到约 500 MB —— 此时 PDF 正文与图片照常转,只是公式不再识别(仍会留下公式图片)。

解释器探测顺序,以及为什么必须隔离:

1. **`vendor/python`**(插件自带)—— 命中后强制 `PYTHONNOUSERSITE=1`,
   与本机 `site-packages` **完全隔离**,避免读到用户环境里版本不匹配的同名包;
2. `DSHM_PYTHON` 环境变量 —— 高级用户想用系统 Python 时指定;
3. `python` / `python3` / `py` —— 最后的兜底。

所以使用者**不需要预装 Python**;换一台机器把插件目录整个拷走也能直接转 PDF。

## 测试

```
node test/smoke.js            # ZIP + XML 底层
node test/run-convert.js      # 小夹具端到端
node test/verify-full.js      # 全量夹具 + 断言(含可编辑/回写往返)
node test/verify-import.js    # 拓展插件:.doc / .odt → docx(15 项断言,需引擎)
node test/verify-pdf.js       # PDF:先分类再转(7 项断言,端到端需样本+pdf2docx)
node test/roundtrip.js <docx> # 任意文档往返对比:转 → 回写 → 再转,正文逐行比

# 排版样板 & 校对工具
node test/format-paper.js <可编辑产物目录>       # 改成学术论文格式 → 论文格式.docx
node test/verify-format.js <原产物目录> <docx>   # 只改格式没动文字?
node test/inspect-docx.js <docx>                 # 页面设置 / 段落与字符格式统计
node test/dump-para.js <docx> [n]                # 打印前 n 段 XML(排错)
node test/find-size.js <docx> <半磅> [xml]        # 查某字号的 run 在哪个段落
```
