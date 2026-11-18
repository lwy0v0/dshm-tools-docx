"""LaTeX → OMML(Office Math Markup Language)转换器。

为什么不用现成的 `mathml2omml`:
它逐字符生成 `<m:r>`,Word/LibreOffice 渲染时每个 run 之间都带间距,整条公式变成
「S o f t m a x」;根式(`\\sqrt{}`)还会丢内容;结构层层包 `<m:box>`。

这里自己解析 LaTeX 直接产出 OMML:
- 连续文本合并成一个 run(不再逐字符);
- 分式 / 上下标 / 根式 / 求和积分 / 定界符 按 OMML 标准结构生成;
- 未知命令降级成文本,不抛异常。

只依赖标准库。
"""

import re

M = 'http://schemas.openxmlformats.org/officeDocument/2006/math'

# 希腊字母与常用符号 → Unicode
符号 = {
    'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ', 'epsilon': 'ε', 'varepsilon': 'ε',
    'zeta': 'ζ', 'eta': 'η', 'theta': 'θ', 'vartheta': 'ϑ', 'iota': 'ι', 'kappa': 'κ',
    'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ', 'pi': 'π', 'rho': 'ρ', 'sigma': 'σ',
    'tau': 'τ', 'upsilon': 'υ', 'phi': 'φ', 'varphi': 'ϕ', 'chi': 'χ', 'psi': 'ψ', 'omega': 'ω',
    'Gamma': 'Γ', 'Delta': 'Δ', 'Theta': 'Θ', 'Lambda': 'Λ', 'Xi': 'Ξ', 'Pi': 'Π',
    'Sigma': 'Σ', 'Upsilon': 'Υ', 'Phi': 'Φ', 'Psi': 'Ψ', 'Omega': 'Ω',
    'sum': '∑', 'prod': '∏', 'int': '∫', 'iint': '∬', 'oint': '∮',
    'infty': '∞', 'partial': '∂', 'nabla': '∇', 'forall': '∀', 'exists': '∃',
    'le': '≤', 'leq': '≤', 'ge': '≥', 'geq': '≥', 'ne': '≠', 'neq': '≠',
    'approx': '≈', 'equiv': '≡', 'sim': '∼', 'simeq': '≃', 'cong': '≅',
    'times': '×', 'div': '÷', 'pm': '±', 'mp': '∓', 'cdot': '·', 'circ': '∘',
    'to': '→', 'rightarrow': '→', 'leftarrow': '←', 'Rightarrow': '⇒', 'Leftarrow': '⇐',
    'leftrightarrow': '↔', 'mapsto': '↦',
    'in': '∈', 'notin': '∉', 'subset': '⊂', 'supset': '⊃', 'subseteq': '⊆', 'supseteq': '⊇',
    'cup': '∪', 'cap': '∩', 'emptyset': '∅', 'varnothing': '∅',
    'angle': '∠', 'perp': '⊥', 'parallel': '∥', 'propto': '∝',
    'therefore': '∴', 'because': '∵', 'ldots': '…', 'cdots': '⋯', 'dots': '…',
    'lfloor': '⌊', 'rfloor': '⌋', 'lceil': '⌈', 'rceil': '⌉',
    'langle': '⟨', 'rangle': '⟩', 'vert': '|', 'Vert': '‖', 'mid': '|',
    'quad': ' ', 'qquad': ' ', ',': ' ', ';': ' ', ':': ' ', '!': '', ' ': ' ',
    '{': '{', '}': '}', '%': '%', '$': '$', '#': '#', '&': '&', '_': '_',
}

# 这些命令后面跟的参数是"文字",不是公式
文本命令 = {'mathrm', 'text', 'textrm', 'mathbf', 'mathit', 'mathsf', 'operatorname',
            'boldsymbol', 'mathbb', 'mathcal', 'mathfrak', 'mathtt', 'textbf'}

大运算符 = {'sum', 'prod', 'int', 'iint', 'oint'}

# 函数名:角标挂在整个名字上(不能拆成 "mi" + "n_下标")
函数名 = {'min', 'max', 'log', 'ln', 'lg', 'lim', 'sin', 'cos', 'tan', 'cot',
        'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'exp', 'det', 'sup', 'inf',
        'arg', 'dim', 'ker', 'deg', 'gcd', 'mod', 'bmod'}


def 转义(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def run(text, 斜体=False):
    """一个文本 run。连续文本会走这里,所以同一段文字只有一个 run。"""
    if not text:
        return ''
    pr = '<m:rPr><m:sty m:val="i"/></m:rPr>' if 斜体 else ''
    return f'<m:r>{pr}<m:t xml:space="preserve">{转义(text)}</m:t></m:r>'


class 解析器:
    def __init__(self, tex):
        self.s = tex
        self.i = 0

    def 窥(self):
        return self.s[self.i] if self.i < len(self.s) else ''

    def 前进(self):
        c = self.窥()
        self.i += 1
        return c

    def 跳空白(self):
        while self.窥() and self.窥().isspace():
            self.i += 1

    # ---- 主循环:把一段 LaTeX 拆成 OMML ----
    def 解析(self, 截止=None, 停在right=False):
        out = []
        缓冲 = []          # 累积普通字符,最后合并成一个 run

        def 冲缓冲():
            if 缓冲:
                文本 = ''.join(缓冲)
                # 连续空白压成一个:PDF/OCR 常带进成片的空格或 NBSP,
                # 原样写进 <m:t> 会在公式后面拖出极长空白。
                文本 = re.sub(r'[\s\u00a0]{2,}', ' ', 文本)
                if 文本.strip():
                    out.append(run(文本))
                缓冲.clear()

        while self.i < len(self.s):
            c = self.窥()
            if 截止 and c == 截止:
                break

            if c == '\\':
                # \right 由外层 \left 处理,这里只负责停下
                if 停在right and self.s.startswith('\\right', self.i):
                    break
                冲缓冲()
                out.append(self.命令())
                continue

            if c == '{':
                self.前进()
                内 = self.解析(截止='}')
                self.前进()      # 吃掉 '}'
                out.append(内)
                continue

            if c in '^_':
                冲缓冲()
                out.append(self.角标())
                continue

            if c == "'":
                冲缓冲()
                缓冲.append('′')
                self.前进()
                continue

            if c == '~':
                缓冲.append('\u00a0')
                self.前进()
                continue

            缓冲.append(c)
            self.前进()

        冲缓冲()
        return ''.join(out)

    # ---- 角标:与前一个元素组合 ----
    def 角标(self):
        上 = 下 = ''
        while True:
            c = self.窥()
            if c == '^':
                self.前进()
                上 = self.取参数()
            elif c == '_':
                self.前进()
                下 = self.取参数()
            else:
                break
        # 角标要贴在**前一个元素**上,由调用方处理 —— 这里用一个占位标记
        return f'@@SUBPOS@@{上}@@SUB@@{下}@@END@@'

    def 取参数(self):
        """取一个逻辑参数:裸字符 / {...} / 命令"""
        self.跳空白()
        c = self.窥()
        if c == '{':
            self.前进()
            内 = self.解析(截止='}')
            self.前进()
            return 内
        if c == '\\':
            return self.命令()
        if c:
            self.前进()
            return run(c)
        return ''

    def 命令(self):
        self.前进()          # 吃掉 '\'
        if not self.窥():
            return ''
        # 反斜杠 + 单字符命令
        if not self.窥().isalpha():
            c = self.前进()
            if c == '\\':
                return run(' ')      # \\ 换行 → 空格(矩阵内由 解析表格 另行处理)
            return run(符号.get(c, c))

        名字 = ''
        while self.窥().isalpha():
            名字 += self.前进()
        self.跳空白()

        if 名字 == 'frac':
            分子 = self.取参数()
            分母 = self.取参数()
            return f'<m:f><m:num>{分子}</m:num><m:den>{分母}</m:den></m:f>'

        if 名字 == 'sqrt':
            次数 = ''
            if self.窥() == '[':
                self.前进()
                次数 = self.解析(截止=']')
                self.前进()
            内容 = self.取参数()
            if 次数:
                return f'<m:rad><m:deg>{次数}</m:deg><m:e>{内容}</m:e></m:rad>'
            return f'<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>{内容}</m:e></m:rad>'

        if 名字 in 文本命令:
            内容 = self.取参数()
            # 文本里的 <m:r> 去掉斜体
            内容 = 内容.replace('<m:r><m:rPr><m:sty m:val="i"/></m:rPr>', '<m:r>')
            return 内容

        if 名字 in 大运算符:
            字符 = 符号[名字]
            下 = 上 = ''
            # 可能紧跟上下限
            while self.窥() in ('_', '^'):
                c = self.前进()
                参 = self.取参数()
                if c == '_':
                    下 = 参
                else:
                    上 = 参
            主体 = self.取参数() if self.窥() not in ('}', ']', '') else ''
            限位 = 'undOvr' if 名字 == 'sum' or 名字 == 'prod' else 'subSup'
            return (
                f'<m:nary><m:naryPr><m:chr m:val="{字符}"/><m:limLoc m:val="{限位}"/></m:naryPr>'
                f'<m:sub>{下}</m:sub><m:sup>{上}</m:sup><m:e>{主体}</m:e></m:nary>'
            )

        if 名字 == 'left':
            开始 = self.取定界符()
            内容 = self.解析(停在right=True)
            # 吃掉 \right 与它的定界符
            结束 = ''
            if self.s.startswith('\\right', self.i):
                self.i += len('\\right')
                结束 = self.取定界符()
            return (
                f'<m:d><m:dPr><m:begChr m:val="{开始}"/><m:endChr m:val="{结束 or ")"}"/>'
                f'</m:dPr><m:e>{内容}</m:e></m:d>'
            )

        if 名字 == 'right':
            # 没有配对的 \left —— 当作普通定界符
            return run(self.取定界符())

        if 名字 == 'begin':
            环境 = self.取参数()
            环境名 = re.sub(r'\{|\}', '', 环境 or '')
            if 'array' in 环境名 or 'matrix' in 环境名 or 'aligned' in 环境名:
                self.取参数()                      # 吃掉列格式 {l l}
                return self.解析表格()
            return ''

        if 名字 == 'end':
            self.取参数()
            return ''

        if 名字 == '\\\\':
            return run(' ')   # 矩阵换行由 解析表格 处理

        if 名字 in 符号:
            return run(符号[名字])

        # 未知命令:降级成文本
        return run(名字)

    def 解析表格(self):
        """\\begin{array}{...} … \\end{array} → OMML 矩阵 m:m。"""
        原 = self.i
        深度 = 1
        # 先找到配对的 \end{array}
        扫描 = self.i
        while 扫描 < len(self.s):
            if self.s.startswith('\\begin', 扫描):
                深度 += 1
                扫描 += 6
                continue
            if self.s.startswith('\\end', 扫描):
                深度 -= 1
                if 深度 == 0:
                    break
                扫描 += 4
                continue
            扫描 += 1
        if 深度 != 0:
            # 找不到结尾,把剩下的当普通内容
            return self.解析()

        体 = self.s[self.i:扫描]
        # 走到 \end 之后
        self.i = 扫描
        self.跳空白()
        名字 = ''
        while self.窥().isalpha():
            名字 += self.前进()
        self.取参数() if self.窥() == '{' else None

        行们 = []
        for 行 in re.split(r'\\\\', 体):
            if not 行.strip():
                continue
            # 整行只有点/横线/点乘命令 → 是表格虚线残留,不是公式行,丢掉
            去符号 = re.sub(r'\\cdot|\\,|\\;|\\!|\\ ', '', 行)
            去符号 = re.sub(r'[.\-–—_·…\s{}&]', '', 去符号)
            if not 去符号:
                continue
            列们 = []
            for 格 in 行.split('&'):
                if not 格.strip():
                    continue
                子 = 解析器(格).解析()
                子 = 后处理(子)
                if 子.strip():
                    列们.append(子)
            if 列们:
                # 列之间直接相接(内容里已带逗号/空格)。
                # 不用 m:m 矩阵 —— 矩阵有独立的列间距,同一行两个式子之间
                # 会被撑出一大片空白,和原文的「逗号分隔」不符。
                行们.append(''.join(列们))

        if not 行们:
            return ''
        if len(行们) == 1:
            return 行们[0]
        # 多行用方程组 m:eqArr(按行堆叠,不带列间距)
        return '<m:eqArr>' + ''.join(f'<m:e>{r}</m:e>' for r in 行们) + '</m:eqArr>'

    def 取定界符(self):
        self.跳空白()
        c = self.窥()
        if c == '\\':
            self.前进()
            名字 = ''
            while self.窥().isalpha():
                名字 += self.前进()
            return 符号.get(名字, '')
        if c:
            self.前进()
            return c
        return ''


def 后处理(omml):
    """把 @@SUBPOS@@ 占位替换成真正的上下标结构,并把它挂到前一个元素上。"""
    # 形式: 前置内容 + @@SUBPOS@@上@@SUB@@下@@END@@
    结果 = []
    位置 = 0
    while True:
        起 = omml.find('@@SUBPOS@@', 位置)
        if 起 < 0:
            结果.append(omml[位置:])
            break
        止 = omml.find('@@END@@', 起)
        if 止 < 0:
            结果.append(omml[位置:])
            break

        中间 = omml[起 + len('@@SUBPOS@@'):止]
        上, 下 = '', ''
        if '@@SUB@@' in 中间:
            上, 下 = 中间.split('@@SUB@@', 1)
        else:
            上 = 中间

        # 找前一个元素(倒数第二个 run / 结构)作为底
        前缀 = omml[位置:起]
        底 = ''
        if 前缀.endswith('</m:r>'):
            r起 = 前缀.rfind('<m:r>')
            if r起 >= 0:
                底 = 前缀[r起:]
                前缀 = 前缀[:r起]
                # run 里可能攒了多个字符(如 "(Y"),角标只挂在**最后一个字符**上;
                # 但函数名(min、log、lim…)要整体作底,不能拆。
                mt = re.search(r'<m:t[^>]*>(.*?)</m:t>', 底, re.S)
                if mt and len(mt.group(1)) > 1:
                    文字 = mt.group(1)
                    if 文字 in 函数名:
                        pass
                    else:
                        前缀 += run(文字[:-1])
                        底 = run(文字[-1])
        elif 前缀.endswith('</m:e></m:nary>') or 前缀.endswith('</m:num></m:f>'):
            # 复杂结构不拆,直接把角标作为独立 run
            pass

        if 底 and 上 and 下:
            结果.append(前缀 + f'<m:sSubSup><m:e>{底}</m:e><m:sub>{下}</m:sub><m:sup>{上}</m:sup></m:sSubSup>')
        elif 底 and 上:
            结果.append(前缀 + f'<m:sSup><m:e>{底}</m:e><m:sup>{上}</m:sup></m:sSup>')
        elif 底 and 下:
            结果.append(前缀 + f'<m:sSub><m:e>{底}</m:e><m:sub>{下}</m:sub></m:sSub>')
        else:
            结果.append(前缀 + run(上) + run(下))

        位置 = 止 + len('@@END@@')

    return ''.join(结果)


def latex_to_omml(tex):
    """LaTeX 片段 → OMML(不含外层命名空间)。"""
    if not tex:
        return ''
    # 去掉 TeX 的编号/标签命令
    tex = re.sub(r'\\(eqno|tag\*?|label)\s*\{?[^}]*\}?', ' ', tex)
    try:
        内 = 解析器(tex).解析()
        内 = 后处理(内)
    except Exception:
        # 解析失败就整段降级成纯文本,至少不丢内容
        内 = run(tex)

    # 清掉只含标点/乱码字符的 run —— pix2tex 常吐出一堆孤立的 "."、"-.-"、¿,
    # 那是 PDF 里的分隔线或识别噪声,在公式里显示成一串点。
    内 = re.sub(r'<m:r>(?:<m:rPr>.*?</m:rPr>)?<m:t[^>]*>[.．·、,，;；:：¿\-\s]{1,4}</m:t></m:r>', '', 内)

    return f'<m:oMath>{内}</m:oMath>'
