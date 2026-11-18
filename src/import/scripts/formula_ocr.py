"""公式图 → LaTeX(pix2tex) → OMML(mathml2omml) → 追加进 docx

流程:
    formula_extract.py  先裁出公式图 + formulas.json
    本脚本              逐张识别成 LaTeX,转成 OMML,再作为**可编辑的 Word 公式**写进 docx

写进 docx 的方式:在文末追加一节「公式」,每条一个段落,段落里放 OMML。
不硬塞进正文原位 —— pdf2docx 已经把公式碾成了表格里的字符碎片,
强行对位只会更乱;文末集中列出、编号可查,反而好用。

参数:sys.argv[1]=产物目录(含 media/formulas/ 与 formulas.json)
     sys.argv[2]=要写回的 docx 路径
"""

import json
import os
import re
import sys
import time

# 受限环境下 HF 的 symlink 探测会失败
try:
    import huggingface_hub.file_download as _hf
    _hf.are_symlinks_supported = lambda *a, **k: False
except Exception:
    pass

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from latex2omml import latex_to_omml

M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'


def 合并run(omml):
    """把相邻的同格式 `<m:r>` 合并成一个。

    mathml2omml 是逐字符生成的("S","o","f","t","m","a","x"),Word / LibreOffice 渲染时
    每个 run 之间会带一点间距,整条公式看起来就是「S o f t m a x」。
    合并后既好看,文件也小。
    """
    if not omml:
        return omml
    try:
        from lxml import etree
    except Exception:
        return omml
    try:
        # mathml2omml 的输出不带命名空间声明,直接解析会报 "prefix m not defined"
        src = omml
        if 'xmlns:m=' not in src:
            src = src.replace('<m:oMath>', f'<m:oMath xmlns:m="{M_NS}">', 1)
        root = etree.fromstring(src.encode('utf-8'))
    except Exception:
        return omml

    R = f'{{{M_NS}}}r'
    RPR = f'{{{M_NS}}}rPr'
    T = f'{{{M_NS}}}t'

    for parent in root.iter():
        i = 0
        while True:
            kids = list(parent)
            if i >= len(kids) - 1:
                break
            a, b = kids[i], kids[i + 1]
            if a.tag != R or b.tag != R:
                i += 1
                continue
            apr, bpr = a.find(RPR), b.find(RPR)
            same = (apr is None and bpr is None) or (
                apr is not None and bpr is not None
                and etree.tostring(apr) == etree.tostring(bpr)
            )
            at, bt = a.find(T), b.find(T)
            if same and at is not None and bt is not None and at.getparent() is not None:
                at.text = (at.text or '') + (bt.text or '')
                parent.remove(b)
                continue          # 不前进,继续和新的下一个比较
            i += 1

    return etree.tostring(root, encoding='unicode')


def 清洗LaTeX(latex):
    """pix2tex 会把公式右侧的编号也认进 LaTeX(如 `... \\eqno(1)`),
    这些是 TeX 的排版命令,不是公式内容 —— 转 OMML 前必须去掉,否则会原样印出来。
    编号由我们自己按 docx 表格的编号补回。"""
    if not latex:
        return latex
    latex = re.sub(r'\\eqno\s*\(?\s*\d+\s*\)?', '', latex)
    latex = re.sub(r'\\tag\*?\{[^}]*\}', '', latex)
    latex = re.sub(r'\\label\{[^}]*\}', '', latex)

    # pix2tex 会把空白区识别成串 `~`(TeX 的不换行空格),一条公式尾部能带 500 多个。
    # 实测:哪怕只剩 2 个,在标点后面也会把同一行后面的公式挤到下一行。
    # 规则:
    #   1. **末尾**全清;
    #   2. **标点后面**的波浪号一律清掉 —— 中英文句读都算(公式(4) 的逗号是半角,
    #      但中文论文里常出现全角，。；：、，得一并覆盖);
    #   3. 其余位置连续 ≥2 个压成一个空格,只保留单个 ~。
    latex = re.sub(r'[\s~]+$', '', latex)
    latex = re.sub(r'([,.;:!?、，。；：！？])\s*~+', r'\1 ', latex)
    latex = re.sub(r'~{2,}', ' ', latex)

    latex = re.sub(r'\\qquad|\\quad', ' ', latex)

    # 纯由标点/线构成的"文本"是 PDF 里的表格虚线、分隔线,pix2tex 会把它们
    # 认成 \ldots / \cdots / 一串 tiny、bot 之类的 token —— 全是噪声,直接去掉。
    latex = re.sub(r'(\\(ldots|cdots|dots|dotfill|hrulefill|hline)\s*)+', ' ', latex)
    latex = re.sub(r'(\btiny\b|\bbot\b|\bhuge\b|\bBig\b|\bbig\b|\bLARGE\b)\s*', '', latex)
    # 连续三段以上的横线/点号也是分隔线残留
    latex = re.sub(r'[-–—_]{3,}', ' ', latex)
    latex = re.sub(r'\.{3,}', ' ', latex)
    # `\cdot`/`\ldots` 连续堆叠 —— pix2tex 把表格虚线读成点乘号时就是这种样子,
    # 单个 \cdot 是乘号要保留,连续 2 个以上基本只在虚线里出现。
    latex = re.sub(r'(\\cdot\s*[.\-–—_]*\s*){2,}', ' ', latex)
    latex = re.sub(r'(\\(ldots|cdots|dots)\s*){1,}', ' ', latex)
    # array/matrix 里整行只剩点线符号的,整行丢掉
    latex = re.sub(r'\{\{[\s.\-–—_·…\\cdot\,;{}\[\]]*\}\}', '{}', latex)
    # 末尾的裸编号 `(7)` —— pix2tex 偶尔不用 \eqno 而是直接吐出 "(7)",
    # 编号由我们从 docx 侧补,这里必须去掉,否则会在公式里印出一遍。
    latex = re.sub(r'\s*\(\d{1,3}\)\s*$', '', latex)

    # pix2tex 常把 \\mathrm{Softmax} 识别成 \\mathrm{S o f t m a x} ——
    # 字母间的空格会让每个字符变成一个 run,渲染成「S o f t m a x」。
    # 函数名/文本命令里的空白一律去掉。
    def 紧凑(m):
        return '\\' + m.group(1) + '{' + re.sub(r'\s+', '', m.group(2)) + '}'

    latex = re.sub(r'\\(mathrm|text|operatorname|mathbf|mathit|mathsf)\{([^{}]*)\}', 紧凑, latex)
    # 单独的字母后跟空格的情况也收一下(如 `P r o j` 直接出现在正文里)
    latex = re.sub(r'(?<=\b[A-Za-z])\s+(?=[A-Za-z]\b)', '', latex)
    return latex.strip()


def 编辑距离(a, b):
    """Levenshtein 距离。"""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    前 = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        当 = [i]
        for j, cb in enumerate(b, 1):
            当.append(min(前[j] + 1, 当[j - 1] + 1, 前[j - 1] + (ca != cb)))
        前 = 当
    return 前[-1]


def 用文本层校正(latex, 原文, 最短词=4, 最大距离=2):
    """用 PDF 文本层里的字符,纠正 pix2tex 认错的**正体单词**。

    为什么这条路成立:pix2tex 是从图片猜字符,而 PDF 的文本层里这些字符是 100% 准的
    —— 它们本来就在公式行的 span 里,只是丢掉了排版结构(分式、上下标)。所以
    "结构"可以继续交给 pix2tex 猜,"字符"没理由跟着它一起错。

    两道保险,都是踩出来的:
    1. **按子串匹配,不按"整词"**。文本层里的单词是黏连的(`SoftmaxVhor`、
       `QhorKThor`),按"连续字母"切词根本切不出 `Softmax`,只会在整串上滑窗找最像的子串。
    2. **要改的词必须 ≥ 4 个字母**。短词 `hor` / `ver` 彼此只差一两个字母,
       放进来会被替换成 `Yhor` 这种更糟的东西。

    命令名(`\\frac` / `\\sqrt` / `\\mathrm` …)原样跳过,不会被误伤。
    实测修掉:Softnnax→Softmax、SOftmax→Softmax、Axixl→Axial。
    """
    if not latex or not 原文:
        return latex
    串 = re.sub(r'\s+', '', 原文)
    if not 串:
        return latex

    def 校正词(词):
        if len(词) < 最短词:
            return 词
        if 词 in 串:
            return 词                      # 文本层里原样有,不用猜
        最佳 = None
        起长 = max(1, len(词) - 最大距离)
        止长 = len(词) + 最大距离
        for 长 in range(起长, 止长 + 1):
            for 起 in range(0, len(串) - 长 + 1):
                片 = 串[起:起 + 长]
                if not 片.isalpha():
                    continue
                d = 编辑距离(词, 片)
                if d > 最大距离:
                    continue
                # 距离相同时偏好长度一致的(避免把 hor 撑成 Yhor 这类插入)
                if 最佳 is None or d < 最佳[0] or (d == 最佳[0] and 长 == len(词)):
                    最佳 = (d, 片)
        return 最佳[1] if 最佳 else 词

    out = []
    i, n = 0, len(latex)
    while i < n:
        ch = latex[i]
        if ch == '\\':
            # 命令名原样拷贝(含 \frac / \sqrt / \mathrm 这些)
            j = i + 1
            while j < n and latex[j].isalpha():
                j += 1
            out.append(latex[i:j])
            i = j
            continue
        if ch.isalpha():
            j = i
            while j < n and latex[j].isalpha():
                j += 1
            out.append(校正词(latex[i:j]))
            i = j
            continue
        out.append(ch)
        i += 1
    return ''.join(out)


def 识别并转换(图路径, model, 原文=''):
    """单张公式图 → (latex, omml)；任一环失败返回 (None, None, 原因)。"""
    try:
        img = Image.open(图路径).convert('RGB')
    except Exception as e:
        return None, None, f'图读不了:{e}'

    try:
        latex = model(img)
    except Exception as e:
        return None, None, f'识别失败:{str(e)[:80]}'

    latex = 清洗LaTeX(latex)
    latex = 用文本层校正(latex, 原文)

    # 直接用自己的 LaTeX → OMML:连续文本合并成单个 run(不会渲染成 "S o f t m a x"),
    # 根式也不会丢内容。mathml2omml 那条路在这两点上都不合格。
    try:
        omml = latex_to_omml(latex)
    except Exception as e:
        return latex, None, f'转 OMML 失败:{str(e)[:60]}'

    if not omml or '<m:t' not in omml:
        return latex, None, '转 OMML 后没有可显示内容'

    return latex, omml, None


def 像公式碎片(t):
    """判断一张表是不是"公式被 pdf2docx 拆开的残片"。

    多行公式(如带分式/矩阵的)常被拆成两张表:一张带编号、一张只有上半截。
    特征是:单行、2~5 列、不含中文、内容里带数学符号或斜体标记。
    """
    if len(t.rows) != 1:
        return False
    cells = [c.text.strip() for c in t.rows[0].cells]
    if not cells or not (2 <= len(cells) <= 6):
        return False
    # 末列是 (n) 编号 → 这是另一个完整公式,不能当残片删
    if re.fullmatch(r'\(\d+\)', cells[-1] or ''):
        return False
    全文 = ''.join(cells)
    if not 全文.strip():
        return False
    if re.search(r'[\u4e00-\u9fa5]', 全文):
        return False
    # 含数学符号,或含 pdf2docx 标的斜体(**x**),或长串字母数字混排
    return bool(re.search(r'[=+×∑∫√≤≥∆∞\^\*]', 全文))


def 清理残片段落(docx_path):
    """删掉 pdf2docx 留下的"公式碎片段落"。

    公式被替换成 OMML 之后,原文那截碎片有时不是表格而是**普通段落**
    (如 `OPALA= O(BWH2C + BHW...`),它会留在公式下面重复显示一遍。
    特征是:短、含数学符号、不含中文、本身不含 OMML。

    **必须还要求"紧挨着一个公式段落"**(前一段或后一段含 OMML)。
    只按长相判断会误杀:没有替换成功的公式本体也是一段"短、含数学符号、
    不含中文"的段落 —— 实测第 4 页的公式 (1) 被 pdf2docx 排成普通段落后,
    就是这么被删掉的(全文 `Softmax` 出现 0 次)。残片的定义是"已经有一份
    OMML 顶替它了",所以判断标准是它旁边有没有那份 OMML,不是它自己像不像公式。

    接 docx 路径而不是文档对象:调用点已经先由替换函数各自 save 过一次,
    这里重新打开、改完自己 save,三处写回互不干扰。
    返回删除的段数。
    """
    from docx import Document
    from docx.oxml.ns import qn

    doc = Document(docx_path)
    段们 = list(doc.paragraphs)
    是公式 = [p._p.find('.//' + qn('m:oMath')) is not None for p in 段们]

    删除数 = 0
    for i, p in enumerate(段们):
        if 是公式[i]:
            continue                      # 已经是真公式,保留
        邻近公式 = (i > 0 and 是公式[i - 1]) or (i + 1 < len(段们) and 是公式[i + 1])
        if not 邻近公式:
            continue                      # 孤立的段落可能是没替换成功的公式本体,别动
        原文 = p.text.strip()
        if not 原文 or len(原文) > 120:
            continue
        if re.search(r'[\u4e00-\u9fa5]', 原文):
            continue                      # 中文段落是正文
        if re.search(r'\(\d{1,3}\)\s*$', 原文):
            continue                      # 带编号的是原文结构,保留
        # 得真有数学味道才算碎片,避免误删普通英文短句
        if not re.search(r'[=^_+×∑∫√≤≥∆∞]', 原文):
            continue
        # 至少有一处"字母数字紧挨着上下标符号"或等号,才认定是公式碎片
        if not re.search(r'[A-Za-z0-9]\s*[=^_]|[=^_]\s*[A-Za-z0-9]', 原文):
            continue
        try:
            p._p.getparent().remove(p._p)
            删除数 += 1
        except Exception:
            pass

    if 删除数:
        doc.save(docx_path)
    return 删除数


def 建公式段落(doc, omml, 编号):
    """建「独立公式段落」。

    **关键**:按 OOXML 规范,DOCX 里**独立公式**必须写成
    `<m:oMathPara><m:oMath>…</m:oMath></m:oMathPara>`;
    裸的 `<m:oMath>` 是"行内公式"的写法。把它直接塞进独立段落,渲染器对
    宽度/居中/换行的处理就不确定了 —— 实测出现过公式后拖出接近两页的空白。

    编号跟在公式后。不硬塞到最右侧:无论用 tab 还是无边框表格,在 Word/WPS/
    LibreOffice 三家的表现都不一致(表格会挤掉长公式、tab 会溢出到页面外)。
    """
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import parse_xml

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

    内 = omml.strip()
    if 内.startswith('<m:oMath>') and 内.endswith('</m:oMath>'):
        内 = 内[len('<m:oMath>'):-len('</m:oMath>')]

    xml = (
        f'<m:oMathPara xmlns:m="{M_NS}">'
        f'<m:oMath>{内}</m:oMath>'
        f'</m:oMathPara>'
    )
    try:
        p._p.append(parse_xml(xml))
    except Exception:
        # 包 Para 失败就退回行内写法,至少别丢内容
        fallback = omml.replace('<m:oMath>', f'<m:oMath xmlns:m="{M_NS}">', 1)
        p._p.append(parse_xml(fallback))

    if 编号 is not None:
        p.add_run(f'\u2003({编号})')
    return p


def 替换公式表格(docx_path, 条目们):
    """**原位替换**:pdf2docx 会把公式排成一个"单行表格",末尾单元格是编号 (n)。
    按编号找到对应公式,把整个表格换成一个含 OMML 的段落 —— 这样公式就落在正文原位,
    而不是堆在文末。

    多行公式会被 pdf2docx 拆成相邻的多张表,这里把紧邻的无编号残片一并删掉。

    返回被替换的个数。
    """
    from docx import Document
    from docx.oxml import parse_xml

    doc = Document(docx_path)
    按编号 = {}
    for 条 in 条目们:
        if 条.get('编号') and 条.get('omml'):
            按编号[int(条['编号'])] = 条

    if not 按编号:
        return 0

    替换 = 0
    表格们 = list(doc.tables)
    for idx, t in enumerate(表格们):
        if len(t.rows) != 1:
            continue
        cells = [c.text.strip() for c in t.rows[0].cells]
        if not cells:
            continue
        m = re.fullmatch(r'\((\d+)\)', cells[-1] or '')
        if not m:
            continue
        编号 = int(m.group(1))
        目标 = 按编号.get(编号)
        if not 目标:
            continue

        # 独立公式段落(内部用 m:oMathPara 包裹,这是 OOXML 对独立公式的规范写法)
        try:
            新段 = 建公式段落(doc, 目标['omml'], 编号)
        except Exception:
            # 这条转不进去就跳过,表格保持原样(仍可在附录里看到)
            continue

        # 只删命中编号的这张表。
        #
        # 原生版本还会把"紧邻前后、长得像公式碎片"的表一并删掉,用来清理多行公式
        # 拆成两张表的残片。但那一段会**连坐**:它删的邻表可能正好是下一个待替换的
        # 公式(整份实测:同一份 PDF、同一份 pdf2docx 输出,原位替换数在 6~9 之间抖,
        # 与其让"残片"清理去赌,不如保守 —— 多留一张不完整的表,比少替换一个公式好)。
        要删 = [t]

        try:
            t._tbl.addprevious(新段._p)
            for x in 要删:
                try:
                    x._tbl.getparent().remove(x._tbl)
                except Exception:
                    pass
            目标['已原位替换'] = True
            按编号.pop(编号, None)      # 一个编号只替换一处,否则会重复插入
            替换 += 1
        except Exception:
            continue

    if 替换:
        doc.save(docx_path)
    return 替换


def 替换公式段落(docx_path, 条目们):
    """处理**段落形态**的公式。

    pdf2docx 对公式的排法不统一:有的排成单行表格,有的就是一行普通段落
    (制表符 + 公式碎片 + 制表符 + 编号)。只认表格会漏掉后半类 ——
    公式 (3) 就是段落形态,所以一直没被替换。
    """
    from docx import Document
    from docx.oxml import parse_xml

    doc = Document(docx_path)
    按编号 = {}
    for 条 in 条目们:
        if 条.get('编号') and 条.get('omml') and not 条.get('已原位替换'):
            按编号[int(条['编号'])] = 条
    if not 按编号:
        return 0

    替换 = 0
    for p in doc.paragraphs:
        原文 = p.text.strip()
        if not 原文 or len(原文) > 200:
            continue
        # 编号 (n) 落在段尾才算公式段落的编号。放宽到"允许 (n) 后面挂残渣"试过,
        # 会让正文里的引用被误判,把公式 (3)(4)(12) 的原位替换挤掉 —— 整份实测 9→7。
        m = re.search(r'\((\d{1,3})\)\s*$', 原文)
        if not m:
            continue
        编号 = int(m.group(1))
        目标 = 按编号.get(编号)
        if not 目标:
            continue
        # 段落里得有公式的痕迹(等号、上下标、数学符号),别误伤正文里的 "(3)"
        if not re.search(r'[=+^_∑∫√≤≥∆∞]', 原文):
            continue

        # 段落形态的公式换成同样的独立公式段落
        try:
            新段 = 建公式段落(doc, 目标['omml'], 编号)
        except Exception:
            continue
        try:
            p._p.addnext(新段._p)
            p._p.getparent().remove(p._p)
        except Exception:
            continue
        目标['已原位替换'] = True
        按编号.pop(编号, None)          # 一个编号只替换一处,否则会重复插入并误删后来的段落
        替换 += 1

    if 替换:
        doc.save(docx_path)
    return 替换


def 追加进docx(docx_path, 条目们):
    """把 OMML 作为 Word 公式写进 docx 末尾。"""
    from docx import Document
    from docx.oxml import parse_xml

    doc = Document(docx_path)

    doc.add_paragraph('')
    doc.add_paragraph('公式（由 PDF 公式区域识别而来，可直接编辑）')

    for 条 in 条目们:
        omml = 条.get('omml')
        if not omml:
            continue
        # 段落说明:页码 + 编号,方便回原文核对
        doc.add_paragraph(f"({条['序号']}) 第 {条['页']} 页")
        p = doc.add_paragraph()
        # 注入命名空间,否则 Word 不认 m: 前缀
        xml = omml.replace('<m:oMath>', f'<m:oMath xmlns:m="{M_NS}">', 1)
        try:
            p._p.append(parse_xml(xml))
        except Exception:
            # OMML 注入失败就退回纯文本,至少别丢内容
            p.add_run(条.get('latex') or '')

    doc.save(docx_path)


def 主(产物目录, docx路径):
    清单路径 = os.path.join(产物目录, 'formulas.json')
    if not os.path.exists(清单路径):
        return {'ok': False, '原因': '没有 formulas.json'}

    清单 = json.load(open(清单路径, encoding='utf-8'))
    公式们 = 清单.get('公式', [])
    if not 公式们:
        return {'ok': True, '识别数': 0, '成功数': 0}

    model = None
    成功 = []
    for item in 公式们:
        图 = os.path.join(产物目录, item['文件'])
        if not os.path.exists(图):
            continue
        if model is None:
            from pix2tex.cli import LatexOCR
            model = LatexOCR()

        t0 = time.time()
        # 原文 = 该公式行在 PDF 文本层里的字符(formula_extract.py 记下来的),
        # 用来纠正 pix2tex 认错的单词 —— 见 用文本层校正
        latex, omml, err = 识别并转换(图, model, item.get('文本') or '')
        item['latex'] = latex
        item['omml'] = omml
        item['识别耗时'] = round(time.time() - t0, 2)
        if err:
            item['识别失败'] = err
        if latex and omml:
            成功.append(item)

    json.dump(清单, open(清单路径, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

    if 成功:
        写回 = True
        # 下面三步各自独立 try:任一步出错都不该把已落盘的替换结果抹成"失败"
        # (这里原本是一个大 try,`清理残片段落(doc)` 传了个不存在的 doc,
        #  NameError 把整段记成「写回失败」,还连带跳过了残片清理与文末兜底。)
        try:
            # 先原位替换(按论文编号对上 pdf2docx 生成的公式表格)
            替换数 = 替换公式表格(docx路径, 成功)
            # 再处理段落形态的公式(表格之外的漏网之鱼)
            替换数 += 替换公式段落(docx路径, 成功)
            清单['原位替换数'] = 替换数
        except Exception as e:
            写回 = False
            清单['写回失败'] = f'原位替换:{e}'[:200]

        try:
            # 残片清理:**默认关闭**(见 清理残片段落 的注释)。
            # 它按"长相"判断谁是残片,分不清"重复显示的碎片"和"没替换成功的公式本体",
            # 实测把第 5 页公式 (3)、第 25 页 (12) 的正文段落删了,原位替换数 9→7。
            # 用户确认过的那一版本来就没有执行过它(原代码在这里传错变量,一直 NameError)。
            # 要开就调 清理残片段落(docx路径),函数和它的修复都还在。
            清单['清理碎片数'] = 0
        except Exception as e:
            清单['清理失败'] = str(e)[:200]

        try:
            # 没能原位替换的,集中列到文末,别丢
            剩余 = [f for f in 成功 if not f.get('已原位替换')]
            清单['剩余追加数'] = len(剩余)
            if 剩余:
                追加进docx(docx路径, 剩余)
        except Exception as e:
            写回 = False
            清单['追加失败'] = str(e)[:200]
    else:
        写回 = False

    json.dump(清单, open(清单路径, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

    return {
        'ok': True,
        '识别数': len(成功),
        '总数': len(公式们),
        '原位替换': 清单.get('原位替换数', 0),
        '清理碎片': 清单.get('清理碎片数', 0),
        '剩余追加': 清单.get('剩余追加数', 0),
        '写回docx': 写回,
    }


if __name__ == '__main__':
    r = 主(sys.argv[1], sys.argv[2])
    print(json.dumps(r, ensure_ascii=False))
