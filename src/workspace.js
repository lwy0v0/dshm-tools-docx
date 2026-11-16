/**
 * 项目根解析。
 *
 * 工具参数里给了 `project` 就用它;**没给才反推**(会话环境变量 → 会话目录名);
 * 都推不出来就返回 null,由调用方决定报错还是退回进程工作目录 —— 绝不瞎猜一个路径。
 * (与 `dshm-tools-midi` 的 `resolveWorkspace()` 同一套做法)
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function dshHome () {
  const home = process.env.DSH_HOME
  if (home && home.trim() !== '') return home.trim()
  return join(homedir(), '.dsh')
}

/** 会话目录名(`--D-APP-dsh--`)→ 工作区路径(`D:\APP\dsh`) */
function 解会话目录名 (token) {
  const 去边 = token.replace(/^-+|-+$/g, '')
  if (!/^[A-Za-z]-/.test(去边)) return null
  const 盘 = 去边.slice(0, 1).toUpperCase()
  const 余 = 去边.slice(2).split('-').filter(Boolean)
  if (!余.length) return null
  return `${盘}:\\${余.join('\\')}`
}

/**
 * 反推当前会话的工作区。
 * @returns {string|null}
 */
export function 解析工作区 () {
  const 会话路径 = process.env.DSH_SESSION_JSONL || process.env.DSH_SESSION_DIR
  if (会话路径) {
    const m = /[\\/]sessions[\\/](.+?)[\\/][^\\/]+[\\/]?[^\\/]*$/.exec(会话路径)
    if (m?.[1]) {
      const 猜 = 解会话目录名(m[1])
      if (猜 && existsSync(猜)) return 猜
    }
  }

  const sessions = join(dshHome(), 'sessions')
  if (!existsSync(sessions)) return null
  let 最新 = null
  let 最新时间 = 0
  try {
    for (const token of readdirSync(sessions)) {
      let mtime = 0
      try {
        mtime = statSync(join(sessions, token)).mtimeMs
      } catch { /* 读不到就当最旧 */ }
      if (mtime > 最新时间) { 最新时间 = mtime; 最新 = token }
    }
  } catch {
    return null
  }
  if (!最新) return null
  const 猜 = 解会话目录名(最新)
  return 猜 && existsSync(猜) ? 猜 : null
}
