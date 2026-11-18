/**
 * Python 探测与调用。
 *
 * **为什么不用管道接输出**:沙箱下 `child_process` 用 `stdio: 'pipe'` 会因为
 * 拿不到匿名管道而 EPERM。所以这里一律 `stdio: 'ignore'`,判定只看退出码,
 * 诊断信息由 Python 侧写进日志文件、Node 再读回来。
 *
 * 解释器优先用插件自带的 `vendor/python`(随插件分发,不依赖本机装没装 Python),
 * 并强制 `PYTHONNOUSERSITE=1` 与本机 site-packages 隔离 —— 否则会读到用户环境里
 * 版本不匹配的同名包。找不到 vendor 时才回落到:
 * `DSHM_PYTHON` 环境变量 → `python` → `python3` → `py`。
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 插件根目录(src/import/python.js 往上两级) */
const 插件根 = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 插件自带的解释器路径(随包分发) */
export function vendor解释器 () {
  const 相对 = process.platform === 'win32'
    ? join('vendor', 'python', 'python.exe')
    : join('vendor', 'python', 'bin', 'python3')
  const 全 = join(插件根, 相对)
  return existsSync(全) ? 全 : null
}

/** 候选解释器(系统侧的兜底) */
function 候选解释器 () {
  const 出 = []
  if (process.env.DSHM_PYTHON) 出.push(process.env.DSHM_PYTHON)
  出.push('python', 'python3', 'py')
  return 出
}

let 缓存解释器 = null
let 已探测 = false
let 用的是vendor = false

/**
 * 找可用的 Python 解释器。
 * @returns {string|null}
 */
export function 找Python () {
  if (已探测) return 缓存解释器
  已探测 = true

  // 1. 插件自带环境优先
  const v = vendor解释器()
  if (v) {
    const r = spawnSync(v, ['-c', 'import sys; sys.exit(0)'], {
      stdio: 'ignore',
      timeout: 20_000,
      windowsHide: true,
      env: { ...process.env, PYTHONNOUSERSITE: '1' }
    })
    if (r.status === 0) {
      缓存解释器 = v
      用的是vendor = true
      return v
    }
  }

  // 2. 系统环境兜底
  for (const 命令 of 候选解释器()) {
    const r = spawnSync(命令, ['-c', 'import sys; sys.exit(0)'], {
      stdio: 'ignore',
      timeout: 15_000,
      windowsHide: true
    })
    if (r.status === 0) {
      缓存解释器 = 命令
      用的是vendor = false
      return 命令
    }
  }
  return null
}

/** 当前解释器是不是插件自带的(用于报错文案区分) */
export function 用自带环境 () {
  return 用的是vendor
}

/**
 * 跑一段 Python 代码(异步:大文档转换会跑很久,不能卡住事件循环)。
 *
 * 参数通过 `sys.argv` 传入:代码里 `sys.argv[1]` 是第一个参数
 * (因为 `python -c <代码> a b` 的 argv[0] 是 `-c`)。
 *
 * @param {{代码:string, 参数?:string[], 超时?:number}} 任务
 * @returns {Promise<{成功:boolean, 日志:string, 超时:boolean, 说明?:string}>}
 */
export function 跑Python ({ 代码, 参数 = [], 超时 = 300_000, 环境 = null }) {
  return new Promise((resolve) => {
    const 解释器 = 找Python()
    if (!解释器) {
      resolve({
        成功: false,
        日志: '',
        超时: false,
        说明: '找不到 Python 解释器(已试 python / python3 / py);可用 DSHM_PYTHON 环境变量指定'
      })
      return
    }

    const 仓 = mkdtempSync(join(tmpdir(), 'dshm-py-'))
    const 脚本 = join(仓, 'main.py')
    const 日志 = join(仓, 'log.txt')
    writeFileSync(脚本, 代码, 'utf8')

    // 包一层:未捕获异常写进日志文件,再以非零码退出
    const 包裹 = [
      'import sys, traceback',
      `_log = open(r"${日志}", "w", encoding="utf-8")`,
      'try:',
      `    exec(compile(open(r"${脚本}", encoding="utf-8").read(), r"${脚本}", "exec"), {"__name__": "__main__"})`,
      'except SystemExit:',
      '    _log.close()',
      '    raise',
      'except BaseException:',
      '    _log.write(traceback.format_exc())',
      '    _log.close()',
      '    sys.exit(1)',
      '_log.close()'
    ].join('\n')

    let 超时了 = false
    let 已结束 = false

    const 收尾 = (码, 错误) => {
      if (已结束) return
      已结束 = true
      清除计时()
      let 日志内容 = ''
      try {
        日志内容 = readFileSync(日志, 'utf8')
      } catch { /* 没写就是空 */ }
      try {
        rmSync(仓, { recursive: true, force: true })
      } catch { /* 清理失败不影响结果 */ }
      resolve({
        成功: 码 === 0 && !超时了,
        日志: 日志内容,
        超时: 超时了,
        说明: 错误 ? String(错误.message || 错误) : undefined
      })
    }

    let 计时
    const 清除计时 = () => {
      if (计时) clearTimeout(计时)
    }

    let 子进程
    try {
      子进程 = spawn(解释器, ['-c', 包裹, ...参数], {
        stdio: 'ignore',
        windowsHide: true,
        // 用自带环境时必须隔离:否则会读到本机 site-packages 里版本不匹配的同名包
        env: {
          ...process.env,
          ...(用的是vendor ? { PYTHONNOUSERSITE: '1' } : {}),
          ...(环境 || {})
        }
      })
    } catch (e) {
      收尾(-1, e)
      return
    }

    计时 = setTimeout(() => {
      超时了 = true
      try { 子进程.kill() } catch { /* 已经退了 */ }
    }, 超时)

    子进程.on('error', (e) => 收尾(-1, e))
    子进程.on('close', (码) => 收尾(码 ?? -1, null))
  })
}
