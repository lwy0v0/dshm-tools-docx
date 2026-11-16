/** 写夹具文件:Windows 上偶尔会被占用(EBUSY),重试几次。 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function 写夹具文件 (路径, 字节) {
  mkdirSync(dirname(路径), { recursive: true })
  let 最后错误
  for (let i = 0; i < 6; i++) {
    try {
      writeFileSync(路径, 字节)
      return 路径
    } catch (e) {
      最后错误 = e
      if (e.code !== 'EBUSY' && e.code !== 'EPERM') throw e
      const 截止 = Date.now() + 300
      while (Date.now() < 截止) { /* 短暂等待句柄释放 */ }
    }
  }
  throw 最后错误
}
