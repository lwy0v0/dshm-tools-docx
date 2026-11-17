/**
 * 测试工作区。
 *
 * 两个位置分开:
 * - **项目根**:本仓根目录(所以产物落在 `D:\APP\dsh\.dshm\docx\`,能直接翻);
 * - **夹具目录**:临时目录(夹具每次重写,避免被别的程序占着报 EBUSY,也不往仓库里堆输入文件)。
 */

import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 本包根目录(`<仓库根>/doc/dshm-tools-docx`,或包被单独拷走时的目录) */
function 包根 () {
  return join(dirname(fileURLToPath(import.meta.url)), '..')
}

/**
 * 测试项目根:往上找含 `dshm-desktop` 的目录(本仓根)。
 * 找不到(例如包被单独拷出去跑)就退回包目录的上一级。
 */
export function 测试项目根 () {
  let 当 = 包根()
  for (let i = 0; i < 6; i++) {
    当 = dirname(当)
    if (existsSync(join(当, 'dshm-desktop'))) return 当
  }
  return dirname(包根())
}

/** 夹具用的临时目录(每次新建) */
export function 新建夹具目录 (名) {
  return mkdtempSync(join(tmpdir(), `dshm-doc-${名}-`))
}
