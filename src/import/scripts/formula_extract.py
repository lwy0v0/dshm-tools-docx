"""从 PDF 里定位**整块数学公式**并裁剪成图片。

判定口径:
- **公式段** = 单独成块的数学公式,可能右侧带编号 `(1)`;
- **行内**的单字母/数字**不算**公式,不裁;
- **图表内**的数字与符号**不算**,不裁。

关键实现:**直接用 PyMuPDF 给出的 line bbox**。
PyMuPDF 在 `get_text('dict')` 里已经按行组织好了 —— `blocks → lines → spans`,
每个 line 自带精确的 `bbox`(这一行的上下左右边界)。之前是自己按 span 的 y 中心
去聚合"行",误差累积后会把相邻行的内容卷进裁剪框(表现为公式图下面多出一条
下一行的上边缘,pix2tex 还会把它读成 `−.−.−.`、`\\leftarrow`、`z` 等噪声)。
现在一行就是 PyMuPDF 定义的一行,裁剪边界不再越界。

参数:sys.argv[1]=pdf  sys.argv[2]=输出目录
"""

import json
import os
import re
import sys

import pymupdf

# 数学字体特征(LaTeX: CMMI/CMSY/CMEX/CMR;Word: OpenSymbol/Cambria Math;STIX 等)
数学字体关键字 = (
    'opensymbol', 'cmmi', 'cmsy', 'cmex', 'cmr', 'msam', 'msbm',
    'stix', 'math', 'symbol', 'eufm', 'rsfs',
)

# 判定公式行:数学字体字符占比下限
数学占比下限 = 0.6
# 裁剪外扩:左右给足(编号/括号),**上下只给 1pt** —— 行 bbox 已经很准,
# 多给一点就会把相邻行的边带进来。
外扩左右 = 6.0
外扩上下 = 1.0
# 太小的行当噪声丢掉。**注意:这个过滤只能用在"合并成组之后"**。
# 公式的组成部分常常自己就是一个极窄的 line —— 分母的 `d` 只有 5.2pt 宽、
# 上标的 `2` 只有 4pt。在进候选之前按宽度筛,会把它们整行丢掉,合并时的 bbox
# 就短一截,裁图直接把分母的下半截切掉(实测公式(2)的下界少了 5.7pt)。
最小宽 = 20.0
最小高 = 6.0
# 同一公式被拆成"上下两行"时(分式/矩阵),纵向间距小于它才合并
合并纵距 = 22.0

# 裁图后是否用像素判据抹表格线。**默认关掉**。
# 理由:裁图已经按行 bbox 精准取,不该把表格线带进来;而像素判据分不清
# "表格线的竖边"和"公式自己的笔画"—— 实测把 `\left( \right)` 的竖边(占列高 42~54%)、
# `Proj` 的 `P` 左竖、`j` 的竖笔、两个 `+` 的竖笔一起抹白,公式 (3) 丢了 14.9% 的墨迹,
# pix2tex 随即把 `+` 读成 `-`、把 `Proj` 读成乱码。
# 要恢复,把这里改成 True;判据已收紧为"必须贯穿整幅"(见 去线条 的文档)。
用去线条 = False


def 是数学字体(font_name):
    low = (font_name or '').lower()
    return any(k in low for k in 数学字体关键字)


def 含中文(text):
    return any('\u4e00' <= ch <= '\u9fa5' for ch in text)


def 是分隔线文本(text):
    """纯由点/横线组成的 span 是 PDF 里的表格虚线,不是文字。"""
    s = text.strip()
    if not s:
        return True
    return len(s) >= 3 and bool(re.fullmatch(r'[.\-–—_·…⋯\s]{3,}', s))


def 是算法行(text):
    """算法伪代码的行(行号 + 分号/箭头),不是公式段。"""
    t = text.strip()
    if not re.match(r'^\d{1,2}', t):
        return False
    return any(k in t for k in (';', '←', 'while', 'do', 'then', 'end'))


def 页面图表密度(page):
    """用矢量绘图覆盖的页面占比,判断这页是不是"图表页"。"""
    try:
        ds = page.get_drawings()
    except Exception:
        return 0.0, []
    if not ds:
        return 0.0, []
    面积 = page.rect.width * page.rect.height
    if 面积 <= 0:
        return 0.0, []
    覆盖 = 0.0
    区域 = []
    for d in ds:
        r = d.get('rect')
        if not r:
            continue
        区域.append(pymupdf.Rect(r))
        覆盖 += max(0.0, r.x1 - r.x0) * max(0.0, r.y1 - r.y0)
    return min(1.0, 覆盖 / 面积), 区域


def 最长连续(布尔):
    """一维布尔数组里最长的一段连续 True 有多长。"""
    import numpy as np
    if not 布尔.any():
        return 0
    补 = np.concatenate(([False], 布尔, [False])).astype(np.int8)
    边 = np.flatnonzero(np.diff(补))
    return int((边[1::2] - 边[0::2]).max())


def 去线条(路径):
    """抹掉贯穿全幅的实线(表格边框)。

    **判据必须是"贯穿整幅"**,不能是"占比够大"。以前用"整行/整列超 40% 黑",
    结果把公式自己的笔画当成表格线抹掉了 —— 实测:
      - 公式 (2):`\\left( \\right)` 的竖边占列高 42%~54%,被整列抹白;
      - 公式 (3):`Proj` 的 `P` 左竖(49%)、`j` 的竖笔、两个 `+` 的竖笔全被抹,
        277 个像素(14.9%)消失。pix2tex 随后把 `+` 读成 `-`、把 `Proj` 读成乱码。
    真正的表格线是**从图的一边到另一边**的,所以要求:黑像素 > 90% 幅长,
    且最长连续段 > 85% 幅长(文字笔画凑出来的"多"是不连续的)。

    另加一道保险:若被判定为线的行/列超过总数的 10%,说明这不是表格而是误判,
    整体放弃 —— 宁可留着噪声,也不能把公式笔画抹掉。

    虚线仍不做像素级处理:试过按"跨度大、密度低"判虚线,把公式笔画也删了。
    虚线的噪声放在 LaTeX 清洗层处理。
    """
    from PIL import Image
    import numpy as np

    img = Image.open(路径).convert('L')
    a = np.array(img)
    if a.ndim != 2 or a.size == 0:
        return
    高, 宽 = a.shape
    黑 = a < 128
    行黑 = 黑.sum(axis=1)
    列黑 = 黑.sum(axis=0)

    要去行 = np.array([行黑[i] > 宽 * 0.9 and 最长连续(黑[i, :]) > 宽 * 0.85
                     for i in range(高)], dtype=bool)
    要去列 = np.array([列黑[i] > 高 * 0.9 and 最长连续(黑[:, i]) > 高 * 0.85
                     for i in range(宽)], dtype=bool)

    if 要去行.sum() > 高 * 0.1 or 要去列.sum() > 宽 * 0.1:
        return          # 判据失控,别动原图
    if not 要去行.any() and not 要去列.any():
        return
    黑[要去行, :] = False
    黑[:, 要去列] = False
    Image.fromarray(np.where(黑, 0, 255).astype('uint8')).save(路径)


def 表格区域(page):
    """这一页的表格区域(PyMuPDF 自带检测)。

    表格单元格里的数字常被排成数学字体("1600 × 1600"、"5 × 10⁻⁴" 里的 `×` 是
    CMSY、`10⁻⁴` 带真上标),单看"数学字体占比"会当公式裁出来。算法伪代码块也
    常被识别成表格(实测第 28 页那个 34 行 2 列的"表"就是算法块)。
    这两种都**不是独立公式**,按表格区域整片排除。

    检测不出来时返回空表 —— 漏检只会让老的问题回来,不会误伤。
    """
    try:
        return [pymupdf.Rect(t.bbox) for t in page.find_tables().tables]
    except Exception:
        return []


def 同行带里有正文(行, 行们, 间隙上限=40.0):
    """同一水平带里紧挨着正文的行,是**行内公式**的一部分,不是独立公式段。

    为什么需要这条:PyMuPDF 会按基线把一行切成多个 line,行内公式的上下标、等号
    各成一个 line,这些 line 的数学字体占比可以是 1.0 —— 单看占比,"行内公式的碎片"
    与"独立居中的公式"没有区别。区别在于上下文:独立公式那一带里**只有数学**,
    行内公式那一带旁边就是正文。

    实测(第 20 页):`where x*_i(*) = L, C, R), y*_i(*) = T, C, B) denotes …` 这一行
    里的公式碎片被当成独立公式裁出来,还抢走了公式 (5) 的编号。
    """
    l, t, r, b = 行['bbox']
    高 = b - t
    if 高 <= 0:
        return False
    for 其他 in 行们:
        if 其他 is 行 or 其他['占比'] >= 数学占比下限:
            continue                       # 也是数学行,不算"正文"
        ol, ot, orr, ob = 其他['bbox']
        if min(b, ob) - max(t, ot) < 高 * 0.5:
            continue                       # 不在同一水平带上
        if max(l, ol) - min(r, orr) < 间隙上限:
            return True
    return False


def _并区域(clip, 编号bbox):
    """把裁图边界和编号位置并成一个矩形(给 pdf2docx 剔文字用)。"""
    if not 编号bbox:
        return [round(v, 1) for v in clip]
    return [
        round(min(clip.x0, 编号bbox[0]), 1),
        round(min(clip.y0, 编号bbox[1]), 1),
        round(max(clip.x1, 编号bbox[2]), 1),
        round(max(clip.y1, 编号bbox[3]), 1),
    ]


def 主(pdf_path, out_dir):
    图片目录 = os.path.join(out_dir, 'media', 'formulas')
    os.makedirs(图片目录, exist_ok=True)

    doc = pymupdf.open(pdf_path)
    候选们 = []

    for pno in range(doc.page_count):
        page = doc[pno]
        密度, 绘图区 = 页面图表密度(page)
        格区 = 表格区域(page)

        # 先把整页的 line 收下来:挑公式行时既要知道它自己有多少数学字符,
        # 也要知道它**旁边**是数学还是正文(行内公式 vs 独立公式,见 同行带里有正文)
        行们 = []
        for b in page.get_text('dict')['blocks']:
            if b.get('type') != 0:
                continue
            for line in b.get('lines', []):
                spans = line.get('spans', [])
                if not spans:
                    continue

                # 这一行的 span(丢掉纯虚线的)
                有效 = []
                for s in spans:
                    t = s.get('text') or ''
                    if not t.strip() or 是分隔线文本(t):
                        continue
                    有效.append(s)
                if not 有效:
                    continue

                数学字 = sum(len(s.get('text', '')) for s in 有效
                            if 是数学字体(s.get('font', '')))
                总字 = sum(len(s.get('text', '')) for s in 有效)
                if 总字 == 0:
                    continue
                行们.append({
                    'bbox': line['bbox'],
                    '占比': 数学字 / 总字,
                    '文本': ''.join(s.get('text', '') for s in 有效),
                })

        for 行 in 行们:
            if 行['占比'] < 数学占比下限:
                continue
            行文本 = 行['文本']
            if 含中文(行文本):
                continue
            if 是算法行(行文本):
                continue

            # ---- 关键:直接用 PyMuPDF 的行 bbox ----
            l, t, r, bb = 行['bbox']
            中心 = pymupdf.Point((l + r) / 2, (t + bb) / 2)

            # 表格里的数字、算法块(常被当成表格)都不是独立公式
            if any(a.contains(中心) for a in 格区):
                continue

            # 落在图表内的是图例/坐标标签,不转
            if any(a.width > 60 and a.height > 40 and a.contains(中心) for a in 绘图区):
                continue

            # 旁边就有正文的是行内公式,不裁
            if 同行带里有正文(行, 行们):
                continue

            # 宽度/高度不在这里筛 —— 见文件头"最小宽"的说明

            # 编号 (1)(2) —— 在**这一行内部**找,不跨界
            编号 = None
            m = re.search(r'\((\d{1,3})\)', 行文本)
            if m:
                编号 = int(m.group(1))

            候选们.append({
                'page': pno,
                'l': l, 't': t, 'r': r, 'b': bb,
                '文本': 行文本,
                '编号': 编号,
            })

    # ---- 合并被分式/矩阵拆开的上下半部 ----
    # PyMuPDF 会把一个公式拆成好几行:主行、分子(在基线上方)、分母(下方)、
    # 上下标各算一行。判据不能只看"上一行底到这一行顶"的单向间距 ——
    # 分子在基线上方时那个距离是**负的**,会漏判。改成看垂直方向是否有重叠。
    候选们.sort(key=lambda x: (x['page'], x['t']))
    合并后 = []
    for c in 候选们:
        合了 = False
        for m in 合并后:
            if m['page'] != c['page']:
                continue
            垂直重叠 = min(m['b'], c['b']) - max(m['t'], c['t'])
            垂直间隙 = max(m['t'], c['t']) - min(m['b'], c['b'])
            横重叠 = min(m['r'], c['r']) - max(m['l'], c['l'])
            # 横向允许一定**间隙**:同一个公式内部相邻元素(如 "Softmax" 与分子)
            # 之间本来就有 2~20pt 的空档,要求"必须重叠"会把这些碎片留在外面。
            # 垂直方向仍要求在同一水平带内,避免把上下相邻的独立公式并进来。
            同一公式 = (垂直重叠 > -12 or 垂直间隙 < 6) and 横重叠 > -35
            if 同一公式:
                m['l'] = min(m['l'], c['l'])
                m['t'] = min(m['t'], c['t'])
                m['r'] = max(m['r'], c['r'])
                m['b'] = max(m['b'], c['b'])
                m['文本'] += c['文本']
                if c['编号']:
                    m['编号'] = c['编号']
                合了 = True
                break
        if not 合了:
            合并后.append(dict(c))

    # ---- 编号:既是标签,也是"把横向拆开的碎片并回去"的线索 ----
    # 编号在 PDF 里通常单独成一个 span(正体数字,不是数学字体),所以它压根不进候选,
    # 只能事后到页面上找。旧实现是"每个组各自往右找 (n)":没有互斥、没有垂直上限,
    # 于是同一个 (5) 被 3 个组同时认领(公式主体 + 一个行内公式碎片),docx 里就出现
    # 三个编号 5 的段落,其中两个是乱码。现在改成"编号池 + 最近优先 + 同编号合并"。
    编号池 = []
    for pno in range(doc.page_count):
        page = doc[pno]
        for b in page.get_text('dict')['blocks']:
            if b.get('type') != 0:
                continue
            for line in b.get('lines', []):
                for s in line.get('spans', []):
                    m = re.fullmatch(r'\((\d{1,3})\)', (s.get('text') or '').strip())
                    if not m:
                        continue
                    编号池.append({
                        'page': pno,
                        'y': (s['bbox'][1] + s['bbox'][3]) / 2,
                        'x0': s['bbox'][0],
                        'bbox': [round(v, 1) for v in s['bbox']],
                        '值': int(m.group(1)),
                    })

    # 每个组挑一个编号:必须在自己右侧,垂直中心距 ≤ 30pt(约三行高),取最近的那个
    for c in 合并后:
        if c.get('编号'):
            continue
        最近 = None
        for 号 in 编号池:
            if 号['page'] != c['page'] or c['r'] > 号['x0']:
                continue
            距 = abs((c['t'] + c['b']) / 2 - 号['y'])
            if 距 > 30:
                continue
            if 最近 is None or 距 < 最近[0]:
                最近 = (距, 号['值'], 号['bbox'])
        if 最近:
            c['编号'] = 最近[1]
            c['编号bbox'] = 最近[2]       # 给 pdf2docx 剔除文字用(见下面的"区域")

    # 同一个编号的组就是同一个公式被**横向**拆开(如 `L_alg = min(…)` 左右两大块),
    # 按编号并回去 —— 否则它们会各自单独 OCR,出来互不相干的几份乱码。
    按编号 = {}
    去重 = []
    for c in 合并后:
        if c.get('编号') is None:
            去重.append(c)
            continue
        键 = (c['page'], c['编号'])
        已有 = 按编号.get(键)
        if 已有 is None:
            按编号[键] = c
            去重.append(c)
            continue
        已有['l'] = min(已有['l'], c['l'])
        已有['t'] = min(已有['t'], c['t'])
        已有['r'] = max(已有['r'], c['r'])
        已有['b'] = max(已有['b'], c['b'])
        已有['文本'] += c['文本']
    合并后 = 去重

    # ---- 出图 ----
    结果 = []
    for c in 合并后:
        # 到这一步才按尺寸判噪声:合并后的整组仍然很小,才是真的小(孤立的行内符号)
        if c['r'] - c['l'] < 最小宽 or c['b'] - c['t'] < 最小高:
            continue
        page = doc[c['page']]
        clip = pymupdf.Rect(
            max(0, c['l'] - 外扩左右), max(0, c['t'] - 外扩上下),
            min(page.rect.width, c['r'] + 外扩左右), min(page.rect.height, c['b'] + 外扩上下),
        )
        if clip.is_empty:
            continue
        序号 = len(结果) + 1
        文件名 = f'f{序号:03d}-p{c["page"] + 1}.png'
        路径 = os.path.join(图片目录, 文件名)
        try:
            pix = page.get_pixmap(clip=clip, dpi=300)
            pix.save(路径)
        except Exception:
            continue
        if 用去线条:
            try:
                去线条(路径)
            except Exception:
                pass
        结果.append({
            '序号': 序号,
            '页': c['page'] + 1,
            '文件': f'media/formulas/{文件名}',
            '宽': pix.width,
            '高': pix.height,
            'bbox': [round(v, 1) for v in clip],
            '编号': c.get('编号'),
            # 「区域」= 公式本体 ∪ 编号,比 bbox 宽(编号在页面右侧)。
            # 两个用途不同,别混:
            #   bbox  —— 裁图边界,不能含编号(编号由 latex2omml 那边补);
            #   区域  —— 传给 pdf2docx 剔除文字的范围,必须含编号,否则 docx 里
            #            会剩一个孤零零的 "(2)" 和公式图片挤在同一段落。
            '区域': _并区域(clip, c.get('编号bbox')),
            '文本': c['文本'][:100],
        })

    清单 = {
        '公式数': len(结果),
        '判定口径': '按 PyMuPDF 的行 bbox 取整行;数学字体占比 ≥%.0f%%、不含中文、不在图表内、非算法伪代码行' % (数学占比下限 * 100),
        '公式': 结果,
    }
    with open(os.path.join(out_dir, 'formulas.json'), 'w', encoding='utf-8') as f:
        json.dump(清单, f, ensure_ascii=False, indent=2)
    return 清单


if __name__ == '__main__':
    r = 主(sys.argv[1], sys.argv[2])
    print(f'公式段 {r["公式数"]} 个')
