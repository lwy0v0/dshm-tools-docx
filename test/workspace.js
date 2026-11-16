/**
 * 测试工作区。
 *
 * 两个位置分开:
 * - **项目根**:本仓根目录(所以产物落在 `D:\APP\dsh\.dshm\doc\`,能直接翻);
 * - **夹具目录**:临时目录(夹具每次重写,避免被别的程序占着报 EBUSY,也不往仓库里堆输入文件)。
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 本仓根目录(测试产物落这里,按存储布局 §3/§4 → `<根>/.dshm/doc/`) */
export function 测试项目根 () {
  // 本文件在 <仓库根>/<包>/test/workspace.js:从 test/ 往上两级就是仓库根
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

/** 夹具用的临时目录(每次新建) */
export function 新建夹具目录 (名) {
  return mkdtempSync(join(tmpdir(), `dshm-doc-${名}-`))
}
