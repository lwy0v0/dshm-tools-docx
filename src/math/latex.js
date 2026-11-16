/**
 * LaTeX 输出用到的公共知识:转义、符号表、命令表。
 *
 * 单独一个文件的原因:公式结构会加、会改,但"字符怎么写成 LaTeX"这件事只该有一份。
 */

/** LaTeX 里必须转义的字符 */
const 需转义 = /([\\{}_^%&#$])/g

/**
 * 普通文本 → LaTeX 安全文本。
 * @param {string} 文本
 */
export function 转义 (文本) {
  return String(文本).replace(需转义, '\\$1')
}

/** 常见数学符号 → LaTeX 命令(不认识的保持原字符,模型也看得懂) */
const 符号表 = new Map(Object.entries({
  '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint',
  '∮': '\\oint', '√': '\\sqrt', '∞': '\\infty', '∂': '\\partial', '∇': '\\nabla',
  '≤': '\\le', '≥': '\\ge', '≠': '\\ne', '≈': '\\approx', '≡': '\\equiv', '∼': '\\sim',
  '×': '\\times', '÷': '\\div', '±': '\\pm', '∓': '\\mp', '·': '\\cdot', '∘': '\\circ',
  '→': '\\to', '←': '\\leftarrow', '⇒': '\\Rightarrow', '⇐': '\\Leftarrow', '↔': '\\leftrightarrow',
  '∈': '\\in', '∉': '\\notin', '⊂': '\\subset', '⊃': '\\supset', '⊆': '\\subseteq', '⊇': '\\supseteq',
  '∪': '\\cup', '∩': '\\cap', '∅': '\\emptyset', '∀': '\\forall', '∃': '\\exists',
  '∠': '\\angle', '⊥': '\\perp', '∥': '\\parallel', '∝': '\\propto', '∴': '\\therefore', '∵': '\\because',
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ε': '\\epsilon', 'ζ': '\\zeta',
  'η': '\\eta', 'θ': '\\theta', 'ι': '\\iota', 'κ': '\\kappa', 'λ': '\\lambda', 'μ': '\\mu',
  'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi', 'ρ': '\\rho', 'σ': '\\sigma', 'τ': '\\tau',
  'υ': '\\upsilon', 'φ': '\\phi', 'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
  'Α': '\\Alpha', 'Β': '\\Beta', 'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda',
  'Ξ': '\\Xi', 'Π': '\\Pi', 'Σ': '\\Sigma', 'Υ': '\\Upsilon', 'Φ': '\\Phi', 'Ψ': '\\Psi', 'Ω': '\\Omega'
}))

/**
 * 文本转 LaTeX(先按符号表替换,再转义剩下的)
 * @param {string} 文本
 */
export function 文本转LaTeX (文本) {
  if (!文本) return ''
  let 出 = ''
  for (const 字 of 文本) {
    出 += 符号表.get(字) ?? 字
  }
  // 已经带反斜杠的命令不能再被转义;只转义"裸"的特殊字符
  return 出.replace(/(?<!\\)([{}_^%&#$])/g, '\\$1')
}

/** 求和/积分类字符 → 命令 */
export const 大运算符 = {
  '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod',
  '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint',
  '⋃': '\\bigcup', '⋂': '\\bigcap', '⨁': '\\bigoplus', '⨂': '\\bigotimes',
  '⋁': '\\bigvee', '⋀': '\\bigwedge'
}

/** 重音符 chr → 命令 */
export const 重音符 = {
  '̂': '\\hat', '\u0302': '\\hat', '̇': '\\dot', '\u0307': '\\dot',
  '̈': '\\ddot', '\u0308': '\\ddot', '̃': '\\tilde', '\u0303': '\\tilde',
  '̄': '\\bar', '\u0304': '\\bar', '⃗': '\\vec', '\u20D7': '\\vec',
  '́': '\\acute', '\u0301': '\\acute', '̀': '\\grave', '\u0300': '\\grave',
  '̆': '\\breve', '\u0306': '\\breve', '̌': '\\check', '\u030C': '\\check'
}

/** 定界符 chr → LaTeX 定界符 */
export const 定界符 = {
  '(': '(', ')': ')', '[': '[', ']': ']', '{': '\\{', '}': '\\}',
  '|': '|', '‖': '\\|', '〈': '\\langle', '〉': '\\rangle',
  '⟨': '\\langle', '⟩': '\\rangle', '⌈': '\\lceil', '⌉': '\\rceil',
  '⌊': '\\lfloor', '⌋': '\\rfloor', '': '.'
}
