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


def _拆空表格(表):
    """把"外壳表格"拆成正文段落。

    公式图片摘走之后,pdf2docx 当初为了对齐公式而生成的表格就只剩一个空壳 ——
    有些格子里还留着落在公式区域之外的半句正文(实测 `are computed as:`),
    在 Word 里看就是一个突兀的空框。正文要留、表格壳子不要。

    只在调用方确认过"这张表被我们摘过图、且里面已经没有图"时才调用,
    免得误拆正经表格。
    """
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    父 = 表.getparent()
    if 父 is None:
        return

    文本们 = []
    for tr in 表.findall(qn('w:tr')):
        for tc in tr.findall(qn('w:tc')):
            t = ''.join(x.text or '' for x in tc.iter(qn('w:t'))).strip()
            if t:
                文本们.append(t)

    # 全空:直接删掉
    if not 文本们:
        父.remove(表)
        return

    # 只剩半句:接回前一段末尾,别把一句话拆成两段。
    # **但前一段含图片时不能接** —— 否则题注会被并进图片段落(实测 Table 1 的
    # 题注就这么跑进了一个含 57 张图的段落里,看起来就是"图注错位")。
    前一 = 表.getprevious()
    if len(文本们) == 1 and 前一 is not None and 前一.tag == qn('w:p') \
            and 前一.find('.//' + qn('w:drawing')) is None:
        末尾们 = 前一.findall('.//' + qn('w:t'))
        if 末尾们:
            末尾们[-1].text = (末尾们[-1].text or '') + 文本们[0]
            末尾们[-1].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
            父.remove(表)
            return

    位置 = list(父).index(表)
    for i, 文本 in enumerate(文本们):
        p = OxmlElement('w:p')
        r = OxmlElement('w:r')
        t = OxmlElement('w:t')
        t.text = 文本
        t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        r.append(t)
        p.append(r)
        父.insert(位置 + i, p)
    父.remove(表)


def 分离图注(docx_path):
    """把"挤在图片段落里的题注文字"拆到独立段落。

    pdf2docx 会把同一行上的图片和文字并进同一个段落 —— 实测 body 里有一个段落
    同时含 57 张图和 `Table 1: Comparison of existing …`。在 Word 里看就是
    "图片和它的说明对不上",因为题注根本没有自己的段落。

    做法:段落同时含 ``w:drawing`` 且文字以 Figure/Table/Algorithm N 开头时,
    把承载文字的那些 run 整体挪到该段之后的新段落里(图片留在原段)。

    返回拆出来的题注段数。
    """
    from docx import Document
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    doc = Document(docx_path)
    拆了 = 0
    for p in list(doc.element.body.iter(qn('w:p'))):
        if p.getparent() is None:
            continue
        if p.find('.//' + qn('w:drawing')) is None:
            continue
        文本 = ''.join(t.text or '' for t in p.iter(qn('w:t'))).strip()
        if not re.match(r'(Figure|Table|Algorithm)\s*S?\d', 文本, re.I):
            continue

        题注runs = []
        for r in p.findall(qn('w:r')):
            if ''.join(t.text or '' for t in r.iter(qn('w:t'))).strip():
                题注runs.append(r)
        if not 题注runs:
            continue

        新段 = OxmlElement('w:p')
        for r in 题注runs:
            p.remove(r)
            新段.append(r)
        p.addnext(新段)
        拆了 += 1

    if 拆了:
        doc.save(docx_path)
    return 拆了


def _纯图段落(p):
    """这一段落是否"只有图、没有文字"。"""
    from docx.oxml.ns import qn

    if p.tag != qn('w:p'):
        return False
    if p.find('.//' + qn('w:drawing')) is None:
        return False
    return not ''.join(t.text or '' for t in p.iter(qn('w:t'))).strip()


def _图尺寸(p):
    """段落里第一张图的 (cx, cy),单位 EMU。"""
    WP = '{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}'
    ext = p.find('.//' + WP + 'extent')
    if ext is None:
        return None
    try:
        return int(ext.get('cx')), int(ext.get('cy'))
    except (TypeError, ValueError):
        return None


def 图片归位(docx_path):
    """把跑到文档开头的图片段落,挪到它对应的题注之前。

    为什么会有这一步:pdf2docx 的 Layout 会把图片块分到独立的 group,输出时
    整批排在文档最前面 —— 实测第 4 页 Figure 3 的 12 张缩略图全在 body[0],
    而它们的标签(Newspaper/Paper/Magazine)和题注 'Figure 3: …' 留在后面,
    图和注因此对不上。改 raw blocks 顺序、改 Blocks.make_docx 顺序都无效,
    因为那套分组在更上层。

    做法:把文档开头**连续**的纯图片段落摘下来,插到第一个题注段落之前。
    题注就是 Figure/Table/Algorithm + 编号 开头的那一行。

    返回移动的段落数。
    """
    from docx import Document
    from docx.oxml.ns import qn

    doc = Document(docx_path)
    body = doc.element.body
    子们 = list(body)

    头图 = []
    for el in 子们:
        if _纯图段落(el):
            头图.append(el)
        else:
            break
    if not 头图:
        return 0

    题注 = None
    for el in 子们:
        if el.tag != qn('w:p'):
            continue
        t = ''.join(x.text or '' for x in el.iter(qn('w:t'))).strip()
        if re.match(r'(Figure|Table|Algorithm)\s*S?\d', t, re.I):
            题注 = el
            break
    if 题注 is None:
        return 0

    for el in 头图:
        body.remove(el)
        题注.addprevious(el)
    return len(头图)


def _是正文续行(t):
    """这一段像不像"正文的一个续行"。"""
    if not t:
        return False
    if re.match(r'(Figure|Table|Algorithm)\s*S?\d', t, re.I):
        return False                              # 图注/表注
    if re.match(r'^\d+[.)]\s', t):
        return False                              # 列表项 1. / 2)
    if re.match(r'^\(?[a-zA-Z0-9]\)\s', t):
        return False                              # (a) / (1)
    if re.match(r'^\d+(\.\d+)*\s*$', t):
        return False                              # 章节号 3.2
    if len(t) <= 24 and t.isupper():
        return False                              # 全大写短标题
    if len(t) <= 6:
        return False                              # 页码、编号之类的碎片
    return True


def 合并断行段落(docx_path):
    """把 pdf2docx 按行宽切碎的段落合并回原文的一段。

    pdf2docx 用"相邻行的宽度是否一致"来分组段落。原文里绕图排版的段落,每一行的
    右边界都不同,于是被切成**一行一段** —— 实测第 4 页的
    'Through the process above … occupancy.' 变成 13 个短段落,在 Word 里看就是
    "前后都有一段不是原文的"(用户实测反馈)。

    合并判据(必须**同时**满足,否则很容易把标题、页码也粘进来):
    * 当前段以连字符结尾('doc-')—— 跨行断词,去掉连字符再拼;
      **或** 当前段不以句读结尾(. ! ? : ;)**且下一段以小写字母开头**
      (真的是同一句的续行);
    * 两段都通过 _是正文续行 的排除规则(图注/列表/章节号/短标题/页码)。

    合并时保留第一段的段落格式;若前一段末尾不是空格而下一段以字母开头,补一个空格。

    返回合并的次数。
    """
    from docx import Document
    from docx.oxml.ns import qn

    doc = Document(docx_path)
    body = doc.element.body

    def 文本(p):
        return ''.join(t.text or '' for t in p.iter(qn('w:t')))

    合并 = 0
    i = 0
    while True:
        段落们 = [e for e in body if e.tag == qn('w:p')]
        if i >= len(段落们) - 1:
            break
        cur, nxt = 段落们[i], 段落们[i + 1]
        t = 文本(cur).strip()
        t2 = 文本(nxt).strip()
        if not _是正文续行(t) or not _是正文续行(t2):
            i += 1
            continue

        应并 = False
        if t.endswith('-'):
            应并 = True
            # 跨行断词:去掉行尾连字符
            末尾们 = cur.findall('.//' + qn('w:t'))
            if 末尾们 and (末尾们[-1].text or '').endswith('-'):
                末尾们[-1].text = 末尾们[-1].text[:-1]
                末尾们[-1].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        elif not re.search(r'[.!?:;]\s*$', t) and t2[:1].islower():
            # 上一段没句读、下一段以小写开头 —— 同一句被切开了
            应并 = True
            # 两段之间补一个空格,否则会拼成 "progressivelproducing"
            if t and not t.endswith(' '):
                末尾们 = cur.findall('.//' + qn('w:t'))
                if 末尾们 and not (末尾们[-1].text or '').endswith(' '):
                    末尾们[-1].text = (末尾们[-1].text or '') + ' '
                    末尾们[-1].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')

        if not 应并:
            i += 1
            continue

        # 把下一段的 run 搬过来(cur 的段落格式保留)
        for r in list(nxt):
            if r.tag == qn('w:pPr'):
                continue
            nxt.remove(r)
            cur.append(r)
        body.remove(nxt)
        合并 += 1

    if 合并:
        doc.save(docx_path)
    return 合并


def 合并同行图片(docx_path, 容差=0.12):
    """把"连续、同尺寸、纯图"的段落合并成一个段落,让它们并排显示。

    pdf2docx 输出时**每个 image block 一个段落**,所以 Figure 3 那种
    "2 行 x 6 列文档页缩略图"的网格会变成 12 个段落竖着堆下来(用户实测:
    "又变成一个图一行了")。同一行里的 6 张图本来该并排占一行 —— 合并到
    一个段落,Word 会把它们依次横排,一行放不下才换行。

    判据:连续、纯图、尺寸相同(±容差)。尺寸一变就说明换行了,自然断开。
    图注/标签是文字段落,不参与合并,顺序不受影响。
    """
    from docx import Document

    doc = Document(docx_path)
    body = doc.element.body
    合并 = 0

    i = 0
    while True:
        子们 = [e for e in body if e.tag.endswith('}p') or e.tag.endswith('}tbl')]
        if i >= len(子们):
            break
        el = 子们[i]
        if not _纯图段落(el):
            i += 1
            continue

        尺寸 = _图尺寸(el)
        组 = [el]
        j = i + 1
        while j < len(子们):
            nxt = 子们[j]
            if not _纯图段落(nxt):
                break
            尺 = _图尺寸(nxt)
            if not 尺寸 or not 尺:
                break
            if abs(尺[0] - 尺寸[0]) > 尺寸[0] * 容差 or abs(尺[1] - 尺寸[1]) > 尺寸[1] * 容差:
                break                      # 尺寸变了 → 换行了
            组.append(nxt)
            j += 1

        if len(组) >= 2:
            首 = 组[0]
            for p in 组[1:]:
                for r in list(p):
                    if r.tag.endswith('}r'):
                        p.remove(r)
                        首.append(r)
                body.remove(p)
            合并 += 1
        i = j

    if 合并:
        doc.save(docx_path)
    return 合并


def 拆含图表格(docx_path, 最大行数=14):
    """把"图被排进表格"的表格摊平成段落序列。

    pdf2docx 有时会把图塞进表格单元格(实测一张 8 行 12 图的表),而原 PDF 那里
    根本没有表格 —— 在 Word 里就是一堆格子把图圈起来,还和图注错位。

    拆法:按 "行 -> 单元格 -> 段落" 的阅读顺序,把单元格里的段落整体搬出来,
    依次插到原表格位置,然后删掉表格。图还是图、字还是字、顺序保留,
    只是不再有格子和边框。

    只处理**含图**且行数不多的表:
    * 不含图的由 _像数据表 / 拆排版表格 分别处理;
    * 行数过多的(>14)可能是双栏或大版式表格,拆了容易乱序,先不动。
    """
    from docx import Document
    from docx.oxml.ns import qn

    doc = Document(docx_path)
    拆了 = 0
    for tbl in list(doc.element.body.iter(qn('w:tbl'))):
        父 = tbl.getparent()
        if 父 is None:
            continue
        if tbl.find('.//' + qn('w:drawing')) is None:
            continue                        # 不含图 → 不归这里管
        if len(tbl.findall(qn('w:tr'))) > 最大行数:
            continue                        # 行太多 → 拆开容易乱序

        搬出 = []
        for tr in tbl.findall(qn('w:tr')):
            for tc in tr.findall(qn('w:tc')):
                for p in tc.findall(qn('w:p')):
                    有图 = p.find('.//' + qn('w:drawing')) is not None
                    有字 = ''.join(t.text or '' for t in p.iter(qn('w:t'))).strip()
                    if not 有图 and not 有字:
                        continue            # 空格子只是占位
                    tc.remove(p)
                    搬出.append(p)

        位置 = list(父).index(tbl)
        for i, p in enumerate(搬出):
            父.insert(位置 + i, p)
        父.remove(tbl)
        拆了 += 1

    if 拆了:
        doc.save(docx_path)
    return 拆了


def _有边框(tbl):
    """这张表有没有可见边框(表格级或单元格级)。"""
    from docx.oxml.ns import qn
    VAL = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val'

    pr = tbl.find(qn('w:tblPr'))
    if pr is not None:
        bd = pr.find(qn('w:tblBorders'))
        if bd is not None:
            for e in bd:
                if (e.get(VAL) or 'none') != 'none':
                    return True
    for tc in tbl.iter(qn('w:tc')):
        tcpr = tc.find(qn('w:tcPr'))
        if tcpr is None:
            continue
        tcb = tcpr.find(qn('w:tcBorders'))
        if tcb is None:
            continue
        for e in tcb:
            if (e.get(VAL) or 'none') != 'none':
                return True
    return False


def _像排版容器(tbl):
    """表格里塞了"图注"或"整句正文" —— 那它只是 pdf2docx 的排版容器。

    真数据表的格子是短标签/数字('M6Doc'、'83.0%'、'Dataset');
    而排版容器里会出现 'Figure 1: Comparisons …' 这种整句、或者被截断的正文
    ('ments remains underexp')。实测第 1 页那张 7 行 3 列表格就是这种。
    """
    from docx.oxml.ns import qn

    for tc in tbl.iter(qn('w:tc')):
        文本 = ''.join(t.text or '' for t in tc.iter(qn('w:t'))).strip()
        if not 文本:
            continue
        if re.match(r'(Figure|Fig\.|Table)\s*\d', 文本):
            return True
        if len(文本) > 40 and ' ' in 文本:
            return True
    return False


def _像数据表(tbl):
    """多行多列、格子内容都是短词 —— 这是真数据表,不能拆。

    为什么需要这条:有的论文表格(如 Table 5 那张"不同预训练数据集对比")在 PDF 里
    只有横线、还原出来**没有单元格边框**,于是被"无边框就拆"的判据误伤,
    整张表被拆成一堆独立的单词段落(实测 Method / Meshgrid / BestFit / M6Doc …)。
    """
    from docx.oxml.ns import qn

    行们 = tbl.findall(qn('w:tr'))
    if len(行们) < 2:
        return False

    格数 = 短格 = 0
    for tr in 行们:
        for tc in tr.findall(qn('w:tc')):
            文本 = ''.join(t.text or '' for t in tc.iter(qn('w:t'))).strip()
            if not 文本:
                continue
            格数 += 1
            if len(文本) <= 20:
                短格 += 1
    # 至少 6 个有内容的格子,且八成以上是短标签/数字
    return 格数 >= 6 and 短格 >= 格数 * 0.8


def 拆排版表格(docx_path):
    """拆掉 pdf2docx 用来对齐版式的"文字容器表格"。

    它生成这种表的场合:图注居中、分段对齐、双栏还原 —— 都不是真表格,只是
    为了让文字落在原来的位置。在 Word 里就成了一堆错位的格子:实测第 1 页
    `Figure 1: Comparisons …` 和正文片段被塞进同一张 7 行表,看起来就是
    "表格和图片对不上"。

    两条通道(满足其一就拆,含图的表和超长表一律不动):
    * `_像排版容器`:格子里出现图注或整句正文 —— 针对性最强,带边框也照拆;
    * 无边框(表格级与单元格级都无)+ 行数 ≤ 12。
    含图的多半是多子图排版,拆了会把图序打乱。

    拆法复用 `_拆空表格`:只剩一段文字的接回前一段末尾(图注正好跟着图),
    多段就按行拆成普通段落 —— 内容与顺序都保留,只是不再有格子。
    """
    from docx import Document
    from docx.oxml.ns import qn

    doc = Document(docx_path)
    拆了 = 0
    for tbl in list(doc.element.body.iter(qn('w:tbl'))):
        if tbl.getparent() is None:
            continue
        if tbl.find('.//' + qn('w:drawing')) is not None:
            continue                       # 含图 → 不动
        if len(tbl.findall(qn('w:tr'))) > 12:
            continue                       # 行太多 → 可能是双栏/大表
        if _像数据表(tbl):
            continue                       # 多行多列短词 → 真数据表,拆了就散了
        if not (_像排版容器(tbl) or not _有边框(tbl)):
            continue                       # 既不像容器、又有边框 → 真表格
        _拆空表格(tbl)
        拆了 += 1

    if 拆了:
        doc.save(docx_path)
    return 拆了


def _找边缘竖排(pdf_path, 字数上限=80, 页宽比例=0.12):
    '''从 PDF 里找出"贴着页面边缘的竖排短文"(如 arXiv 首页左侧的卷期编号)。

    和 pdf2docx/RawPageFitz 里那条判据保持一致:竖排 + 贴边 + 字数少。
    '''
    import pymupdf

    doc = pymupdf.open(pdf_path)
    结果 = []
    for pno in range(doc.page_count):
        page = doc[pno]
        页宽 = page.rect.width
        页高 = page.rect.height
        for b in page.get_text('dict')['blocks']:
            if b.get('type') != 0:
                continue
            行们 = b.get('lines', [])
            if not 行们:
                continue
            竖 = False
            for ln in 行们:
                if ln.get('wmode'):
                    竖 = True
                    break
                d = ln.get('dir') or [1.0, 0.0]
                if abs(d[0]) < 0.5:
                    竖 = True
                    break
            if not 竖:
                continue
            文本 = ' '.join(
                ' '.join((s.get('text') or '').strip() for s in ln.get('spans', [])).strip()
                for ln in 行们
            ).strip()
            if not 文本 or len(文本) > 字数上限:
                continue
            bb = pymupdf.Rect(b['bbox'])
            if not (bb.x1 < 页宽 * 页宽比例 or bb.x0 > 页宽 * (1 - 页宽比例)):
                continue
            # 字号/字体照原文取,别写死 —— 写死会变成一坨小字
            字号 = 0.0
            字体 = ''
            for ln in 行们:
                for s in ln.get('spans', []):
                    if not (s.get('text') or '').strip():
                        continue
                    字号 = max(字号, float(s.get('size') or 0))
                    字体 = 字体 or (s.get('font') or '')
            结果.append({'页': pno + 1, 'bbox': [round(v, 1) for v in bb],
                       '文本': 文本, '字号': round(字号, 1), '字体': 字体})
    return 结果


def _映射字体(名):
    '''把 PDF 里的字体名映射到 Windows/Word 上真实存在的字体。

    不映射的后果:PDF 里叫 `Times-Roman`,Word 里没有这个字体名,会**回落到某种
    默认字体**,字形宽度一变,旋转 90° 之后长度就对不上、文字捅出框外。
    '''
    n = (名 or '').lower()
    if 'times' in n or 'nimbusrom' in n or 'nimbus rom' in n:
        return 'Times New Roman'
    if 'helvetica' in n or 'arial' in n or 'nimbussan' in n:
        return 'Arial'
    if 'courier' in n or 'nimbusmono' in n:
        return 'Courier New'
    if 'symbol' in n:
        return 'Symbol'
    if 'gothic' in n:
        return 'MS Gothic'
    return 'Times New Roman'


def 插入竖排文本框(docx_path, pdf_path):
    '''把 PDF 里的"边缘竖排短文"还原成 Word 里**旋转 90°** 的正文。

    为什么必须在 PDF 侧找:pdf2docx 只要看见竖排文本,就会把那一片版面判成表格
    (``is_flow_layout`` 里"竖排按 stream table 模拟"),为了框住它把正文也卷进表格。
    所以 RawPageFitz 把这行字从版面里摘掉了(不参与布局),这里再按 PDF 原始坐标
    重建一个"固定在页面上"的段落。

    两个关键点(都是实测踩出来的):
    * 用 ``w:framePr`` 定位,不用 VML ``v:shape`` —— 后者的 position:absolute 与
      layout-flow 在 Word 里既不定位也不旋转,只落成左上角一坨小字;
    * ``w:textDirection`` 要用 **``btLr``**(从下往上),不是 ``tbRlV``。
      ``tbRlV`` 是中日文竖排(一字一列往下堆),套在英文上会一字一列地堆下去、
      很快冲出框外;英文要的是**整行旋转 90°**、从下往上读。

    返回插入的个数。
    '''
    from io import BytesIO

    import pymupdf
    from docx import Document
    from docx.shared import Pt

    竖排们 = _找边缘竖排(pdf_path)
    if not 竖排们:
        return 0

    src = pymupdf.open(pdf_path)
    doc = Document(docx_path)
    body = doc.element.body
    插入 = 0

    for 项 in 竖排们:
        x0, y0, x1, y1 = 项['bbox']
        宽pt = max(x1 - x0, 12.0)
        高pt = max(y1 - y0, 40.0)

        # 直接裁 PDF 里那一块 —— 那里的字**本来就是旋转 90° 渲染好的**,
        # 裁出来即是正确样子,不用再跟 Word 的 textDirection 较劲。
        try:
            page = src[项['页'] - 1]
            pix = page.get_pixmap(clip=pymupdf.Rect(x0, y0, x1, y1), dpi=600)
            png = pix.tobytes('png')
        except Exception:
            continue

        try:
            p = doc.add_paragraph()                 # 先加到末尾,再挪到开头
            run = p.add_run()
            run.add_picture(BytesIO(png), width=Pt(宽pt), height=Pt(高pt))
            # 用 framePr 把它钉在页面原坐标上(定位这条 framePr 是可靠的,
            # 不可靠的是它带不动文字方向)
            pr = p._p.get_or_add_pPr()
            frame = pr.makeelement(
                '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}framePr',
                {
                    '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}w': str(int(宽pt * 20)),
                    '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}h': str(int(高pt * 20)),
                    '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}hAnchor': 'page',
                    '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}vAnchor': 'page',
                    '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}x': str(max(int(x0 * 20), 0)),
                    '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}y': str(max(int(y0 * 20), 0)),
                    '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}wrap': 'none',
                    '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}hRule': 'exact',
                }
            )
            pr.insert(0, frame)
            body.insert(0, p._p)                    # 挪到文档开头,别占正文位置
            插入 += 1
        except Exception:
            continue

    if 插入:
        doc.save(docx_path)
    src.close()
    return 插入


def 替换公式图片(docx_path, 条目们):
    """把 pdf2docx 注入的"公式图片"换成 OMML —— **原位替换的正路**。

    背景:pdf2docx 没有公式概念,只会按几何猜布局(公式碎片间 15~20pt 的空档
    会被判成无边框表格),公式在 docx 里要么是一堆散字、要么缩进表格单元格。
    所以我们让它按 PDF 侧的定位结果,把公式区域**渲染成图片**注入
    (见 vendor/.../page/RawPageFitz.py),docx 里那处就是一张尺寸等于公式
    bbox 的图片。这里按尺寸把它认出来,换成 OMML。

    为什么按尺寸认而不是按顺序:文档里还有十几张正文插图,数顺序会错位;
    而 cx/cy(EMU = bbox 宽高 × 12700)是注入时唯一的身份特征。

    段落里可能还有正文(实测 "are computed as:" 和公式被排进同一段),
    所以只摘掉图片、保留段落本身,公式另起一段。摘空的表格壳子最后拆掉。
    """
    from docx import Document
    from docx.oxml.ns import qn

    WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'

    候选 = []
    for 条 in 条目们:
        if not 条.get('omml') or not 条.get('bbox'):
            continue
        x0, y0, x1, y1 = 条['bbox']
        候选.append({
            '条': 条,
            'cx': round((x1 - x0) * 12700),
            'cy': round((y1 - y0) * 12700),
        })
    if not 候选:
        return 0

    doc = Document(docx_path)
    替换 = 0
    已用 = set()
    碰过的表 = []          # 摘过图的表格,最后检查要不要把空壳拆掉

    # 用 XML 遍历而不是 doc.paragraphs:图片可能落在表格单元格里
    for p in list(doc.element.body.iter(qn('w:p'))):
        for 图 in p.findall('.//' + qn('w:drawing')):
            ext = 图.find('.//{%s}extent' % WP)
            if ext is None:
                continue
            try:
                cx, cy = int(ext.get('cx')), int(ext.get('cy'))
            except (TypeError, ValueError):
                continue

            命中 = None
            for i, c in enumerate(候选):
                if i in 已用:
                    continue
                if abs(cx - c['cx']) <= max(3, c['cx'] * 0.02) and \
                   abs(cy - c['cy']) <= max(3, c['cy'] * 0.02):
                    命中 = (i, c['条'])
                    break
            if not 命中:
                continue
            i, 条 = 命中
            已用.add(i)

            try:
                新段 = 建公式段落(doc, 条['omml'], 条.get('编号'))
            except Exception:
                continue
            try:
                # 段落可能在一个表格单元格里(pdf2docx 常把"正文 + 公式"排成表)。
                # 公式必须落在**表格外**,否则会成为表格的一个单元格,既不对齐重排
                # 也会把编号留在单元格里。有表格祖先就插到表格后面。
                祖先 = p.getparent()
                所属表 = None
                while 祖先 is not None:
                    if 祖先.tag == qn('w:tbl'):
                        所属表 = 祖先
                        break
                    祖先 = 祖先.getparent()
                if 所属表 is not None:
                    所属表.addnext(新段._p)
                    if 所属表 not in 碰过的表:
                        碰过的表.append(所属表)
                else:
                    p.addnext(新段._p)
                图.getparent().remove(图)
                条['已原位替换'] = True
                替换 += 1
            except Exception:
                continue

        # 图片摘掉后如果这段只剩空白,删掉它,免得留一堆空行
        剩 = ''.join(t.text or '' for t in p.iter(qn('w:t')))
        if not 剩.strip() and p.find('.//' + qn('w:drawing')) is None:
            父 = p.getparent()
            if 父 is not None and 父.tag == qn('w:body'):
                父.remove(p)

    # 收尾:公式已经挪到表格外面了,当初为对齐公式建的那张表就成了空壳 ——
    # 在 Word 里显示成一个突兀的空框(实测 35 页里 25 张这样的表)。
    for 表 in 碰过的表:
        if 表.getparent() is None:
            continue
        if 表.find('.//' + qn('w:drawing')) is not None:
            continue                  # 还有别的图,别动它
        _拆空表格(表)

    if 替换:
        doc.save(docx_path)
    return 替换


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
        # 跳过硬已经被 替换公式图片 处理过的 —— 否则图片换成公式段落后,
        # 这里又会按编号匹配到那一段,重复插一份公式(实测 3 个公式报成 5)。
        if 条.get('编号') and 条.get('omml') and not 条.get('已原位替换'):
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


def 主(产物目录, docx路径, pdf路径=None):
    清单路径 = os.path.join(产物目录, 'formulas.json')
    if not os.path.exists(清单路径):
        return {'ok': False, '原因': '没有 formulas.json'}

    清单 = json.load(open(清单路径, encoding='utf-8'))
    公式们 = 清单.get('公式', [])
    if not 公式们:
        # 没有公式也要做版式清理:图注/正文被 pdf2docx 塞进了"排版容器表格",
        # 第 1 页就没有公式,但那里的表格一样要拆。
        try:
            拆排版表格(docx路径)
        except Exception:
            pass
        try:
            分离图注(docx路径)
        except Exception:
            pass
        try:
            if pdf路径:
                清单['竖排文本框'] = 插入竖排文本框(docx路径, pdf路径)
        except Exception as e:
            清单['竖排文本框失败'] = str(e)[:200]
        json.dump(清单, open(清单路径, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
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
            # 正路:pdf2docx 按我们给的区域把公式渲染成了图片,这里换成 OMML
            替换数 = 替换公式图片(docx路径, 成功)
            # 兜底:老产物或注入失败的,仍按表格/段落形态匹配
            替换数 += 替换公式表格(docx路径, 成功)
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

    # 拆掉 pdf2docx 的"排版容器表格"。**与公式无关**,所以放在 if 成功 外面 ——
    # 之前放在里面,遇到没有公式的页(第 1 页)整块被跳过,图注就一直留在格子里。
    try:
        清单['拆排版表数'] = 拆排版表格(docx路径)
    except Exception as e:
        清单['拆表失败'] = str(e)[:200]

    # 题注从图片段落里拆出来(见 分离图注 的注释)
    try:
        清单['分离图注数'] = 分离图注(docx路径)
    except Exception as e:
        清单['分离图注失败'] = str(e)[:200]

    # 图被排进表格的,把表格摊平成段落序列
    try:
        清单['拆含图表数'] = 拆含图表格(docx路径)
    except Exception as e:
        清单['拆含图失败'] = str(e)[:200]

    # 同一行的多张图并排(否则一个图一行,网格被压成竖排)
    try:
        清单['合并同行图数'] = 合并同行图片(docx路径)
    except Exception as e:
        清单['合并同行图失败'] = str(e)[:200]

    # 跑到文档开头的图片段落挪回题注之前(页码/顺序错位的补救)
    try:
        清单['图片归位数'] = 图片归位(docx路径)
    except Exception as e:
        清单['图片归位失败'] = str(e)[:200]

    # 把 pdf2docx 按行宽切碎的段落合并回原文(绕图段落会变成"一行一段")
    try:
        清单['合并断行数'] = 合并断行段落(docx路径)
    except Exception as e:
        清单['合并断行失败'] = str(e)[:200]

    # 边缘竖排短文还原成文本框。同样与公式无关:pdf2docx 把它从版面里摘掉了
    # (否则会把整片版面拖成表格),这里按 PDF 原坐标补一个绝对定位的竖排文本框。
    try:
        if pdf路径:
            清单['竖排文本框'] = 插入竖排文本框(docx路径, pdf路径)
    except Exception as e:
        清单['竖排文本框失败'] = str(e)[:200]

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
    r = 主(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    print(json.dumps(r, ensure_ascii=False))
